import type { Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyBaseLogger } from "fastify";
import type { ScanServerAttempt } from "./scanning-client.js";

type ScanEventRow = Database["public"]["Tables"]["dance_scan_events"]["Insert"];
// NonNullable: the indexed access picks up the column's optionality, and under
// exactOptionalPropertyTypes an `undefined` is not assignable back to it.
type ScanEventJson = NonNullable<ScanEventRow["server_attempts"]>;

interface ScanEventBase {
  /** 1-based, so attempt 1 is a scan's first run. */
  attempt: number;
  ownerId: string;
  postId: string;
  scanId: string;
}

/**
 * A union rather than one shape of optional fields: the table exists to answer which
 * server produced a score, so a `scored` event that carries no server must not be
 * expressible. Each variant declares exactly what its moment knows.
 */
export type ScanEvent =
  | (ScanEventBase & { event: "claimed" })
  | (ScanEventBase & {
      event: "answered";
      danceMoveId: string;
      rawScore: number;
      scanDurationMs: number;
      totalScanMs: number;
      scanServerIndex: number;
      scanServerUrl: string;
      serverAttempts: readonly ScanServerAttempt[];
    })
  | (ScanEventBase & {
      event: "scored";
      danceMoveId: string;
      isFirstTime: boolean;
      rawScore: number;
      scanDurationMs: number;
      totalScanMs: number;
      scanServerIndex: number;
      scanServerUrl: string;
      serverAttempts: readonly ScanServerAttempt[];
      updatedScore: number;
    })
  | (ScanEventBase & {
      event: "requeued";
      error: string;
      serverAttempts: readonly ScanServerAttempt[];
      /** Absent when the attempt failed before reaching a scan server. */
      totalScanMs?: number | undefined;
    })
  | (ScanEventBase & {
      event: "fallback";
      danceMoveId: string;
      error: string;
      isFirstTime: boolean;
      rawScore: number;
      serverAttempts: readonly ScanServerAttempt[];
      /** Absent when the final attempt failed before reaching a scan server. */
      totalScanMs?: number | undefined;
      updatedScore: number;
    });

const MESSAGES: Record<ScanEvent["event"], string> = {
  answered: "Dance scan server answered",
  claimed: "Dance scan claimed",
  fallback: "Dance scan exhausted its attempts; wrote a fallback score",
  requeued: "Dance scan attempt failed; returned it to the queue",
  scored: "Dance scan scored",
};

/** Rebuilt field by field rather than cast: `ScanServerAttempt` is not itself `Json`. */
function toJson(attempts: readonly ScanServerAttempt[]): ScanEventJson {
  return attempts.map((attempt) => ({
    durationMs: attempt.durationMs,
    index: attempt.index,
    url: attempt.url,
    ...(attempt.error === undefined ? {} : { error: attempt.error }),
    ...(attempt.httpStatus === undefined ? {} : { httpStatus: attempt.httpStatus }),
  }));
}

/** Derived from the event, never passed in: the two can then never disagree. */
function isExternalScore(event: ScanEvent): boolean | null {
  if (event.event === "answered" || event.event === "scored") return true;
  if (event.event === "fallback") return false;
  return null;
}

function toRow(event: ScanEvent): ScanEventRow {
  const base: ScanEventRow = {
    attempt: event.attempt,
    event: event.event,
    is_external_score: isExternalScore(event),
    owner_id: event.ownerId,
    post_id: event.postId,
    scan_id: event.scanId,
  };
  switch (event.event) {
    case "claimed":
      return base;
    case "requeued":
      return {
        ...base,
        error: event.error,
        server_attempts: toJson(event.serverAttempts),
        total_scan_ms: event.totalScanMs ?? null,
      };
    case "answered":
      // No updated_score or is_first_time: the bonus is computed during the write this
      // event is recorded ahead of, so neither is known yet.
      return {
        ...base,
        dance_move_id: event.danceMoveId,
        raw_score: event.rawScore,
        scan_duration_ms: event.scanDurationMs,
        scan_server_index: event.scanServerIndex,
        scan_server_url: event.scanServerUrl,
        server_attempts: toJson(event.serverAttempts),
        total_scan_ms: event.totalScanMs,
      };
    case "scored":
      // Repeats what 'answered' already holds so the row stands alone: the question
      // this table answers is asked of a score, not of a pair of rows.
      return {
        ...base,
        dance_move_id: event.danceMoveId,
        is_first_time: event.isFirstTime,
        raw_score: event.rawScore,
        scan_duration_ms: event.scanDurationMs,
        scan_server_index: event.scanServerIndex,
        scan_server_url: event.scanServerUrl,
        server_attempts: toJson(event.serverAttempts),
        total_scan_ms: event.totalScanMs,
        updated_score: event.updatedScore,
      };
    case "fallback":
      return {
        ...base,
        dance_move_id: event.danceMoveId,
        error: event.error,
        is_first_time: event.isFirstTime,
        raw_score: event.rawScore,
        server_attempts: toJson(event.serverAttempts),
        total_scan_ms: event.totalScanMs ?? null,
        updated_score: event.updatedScore,
      };
  }
}

interface ScanEventRecorderOptions {
  logger: FastifyBaseLogger;
  supabase: SupabaseClient<Database>;
}

/**
 * Writes one row of scan provenance and logs the same moment. Both outputs come from
 * one call so they cannot drift: the log is what you read while a scan is running, the
 * row is what remains once the post and its scan have been deleted.
 */
export function createScanEventRecorder(options: ScanEventRecorderOptions) {
  return {
    /**
     * `logFields` carries what only a log line wants — the `err` pino serializes, the
     * backoff the queue chose — and is never persisted.
     */
    async record(event: ScanEvent, logFields: Record<string, unknown> = {}): Promise<void> {
      const level = event.event === "requeued" || event.event === "fallback" ? "warn" : "info";
      options.logger[level]({ ...event, ...logFields }, MESSAGES[event.event]);

      // Fail-soft, and deliberately so: losing an audit row is worse than losing one,
      // but not worse than failing a scan the user is waiting on. The failure is itself
      // logged, which is what tells you a gap in the table is a write error and not a
      // scan that never happened.
      try {
        const { error } = await options.supabase.from("dance_scan_events").insert(toRow(event));
        if (error) throw new Error(error.message);
      } catch (error) {
        options.logger.error(
          { err: error, event: event.event, scanId: event.scanId },
          "Could not record a dance scan event",
        );
      }
    },
  };
}
