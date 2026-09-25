import { finalScore, generateFallbackScore } from "@bnewapp/dance-core";
import type { Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import {
  type ClaimedJob,
  MAX_ATTEMPTS,
  STUCK_LOCK_GRACE_MS,
  createJobQueue,
  errorMessage,
  retryAt,
} from "./job-queue.js";
import { type ScanEvent, createScanEventRecorder } from "./scan-events.js";
import {
  type ScanOutcome,
  ScanRequestError,
  type ScanServerAttempt,
  createScanningClient,
} from "./scanning-client.js";

interface ScanWorkerOptions {
  concurrency: number;
  danceVideoBucket: string;
  logger: FastifyBaseLogger;
  scan?: (request: {
    amateurUrl: string;
    expertUrl: string;
    jobId: string;
  }) => Promise<ScanOutcome>;
  /**
   * Injected like `scan`: the default writes to `dance_scan_events`, and a test that
   * drives the worker against a scripted Supabase mock replaces it rather than
   * scripting an insert into every query sequence.
   */
  recordEvent?: (event: ScanEvent, logFields?: Record<string, unknown>) => Promise<void>;
  scanServerUrls: string;
  supabase: SupabaseClient<Database>;
}

/**
 * `attempts` counts the failures behind a row, so the run about to happen is the next
 * one. Named because every log line reports it and an off-by-one here would misattribute
 * a score to the wrong try.
 */
function attemptNumber(scan: ClaimedJob): number {
  return scan.attempts + 1;
}

/** Per-server detail survives only on a `ScanRequestError`; anything else failed earlier. */
function serverAttempts(error: unknown): readonly ScanServerAttempt[] {
  return error instanceof ScanRequestError ? error.attempts : [];
}

export function createScanWorker(options: ScanWorkerOptions) {
  const client = createScanningClient({ serverUrls: options.scanServerUrls });
  const performScan = options.scan ?? ((request) => client.scan(request));
  const recorder = createScanEventRecorder({ logger: options.logger, supabase: options.supabase });
  const recordEvent =
    options.recordEvent ?? ((event, logFields) => recorder.record(event, logFields));

  async function completeScan(
    scan: ClaimedJob,
    danceMoveId: string,
    rawScore: number,
    isExternalScore: boolean,
  ): Promise<{ isFirstTime: boolean; updatedScore: number }> {
    const { count, error: firstTimeError } = await options.supabase
      .from("dance_posts")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", scan.owner_id)
      .eq("dance_move_id", danceMoveId)
      .eq("status", "scored");
    if (firstTimeError) throw new Error("Could not determine first dance attempt");

    const isFirstTime = (count ?? 0) === 0;
    const updatedScore = finalScore(rawScore, isFirstTime);
    const { data: scoredPost, error: postError } = await options.supabase
      .from("dance_posts")
      .update({ status: "scored", score: rawScore })
      .eq("id", scan.post_id)
      .eq("owner_id", scan.owner_id)
      .eq("status", "scoring")
      .select("id")
      .maybeSingle();
    if (postError || !scoredPost) throw new Error("Could not score dance post");

    const { data: completedScan, error: scanError } = await options.supabase
      .from("dance_scans")
      .update({
        status: "completed",
        original_score: rawScore,
        updated_score: updatedScore,
        is_external_score: isExternalScore,
        error: null,
        locked_at: null,
      })
      .eq("id", scan.id)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();
    if (!scanError && completedScan) return { isFirstTime, updatedScore };

    const { data: restoredPost, error: restoreError } = await options.supabase
      .from("dance_posts")
      .update({ status: "uploaded", score: null })
      .eq("id", scan.post_id)
      .eq("owner_id", scan.owner_id)
      .eq("status", "scored")
      .select("id")
      .maybeSingle();
    if (restoreError || !restoredPost)
      throw new Error("Could not restore dance post after scan completion failed");
    throw new Error("Could not complete dance scan");
  }

  async function processClaim(scan: ClaimedJob) {
    const attempt = attemptNumber(scan);
    try {
      const { data: post, error: postError } = await options.supabase
        .from("dance_posts")
        .select("id, dance_move_id, video_path, dance_moves(film_yourself_video_url)")
        .eq("id", scan.post_id)
        .eq("owner_id", scan.owner_id)
        .maybeSingle();
      if (postError || !post?.video_path || !post.dance_moves?.film_yourself_video_url) {
        throw new Error("Dance scan post is missing its video or reference move");
      }
      const { data: signedRead, error: signedReadError } = await options.supabase.storage
        .from(options.danceVideoBucket)
        .createSignedUrl(post.video_path, 5 * 60);
      if (signedReadError || !signedRead?.signedUrl) throw new Error("Could not sign dance video");

      const outcome = await performScan({
        expertUrl: post.dance_moves.film_yourself_video_url,
        amateurUrl: signedRead.signedUrl,
        jobId: scan.post_id,
      });
      // Recorded before the write below, not after it: a score that arrives and then
      // fails to persist is requeued and fetched again, and without this row nothing
      // would show the scan server had ever produced it.
      await recordEvent({
        attempt,
        danceMoveId: post.dance_move_id,
        event: "answered",
        ownerId: scan.owner_id,
        postId: scan.post_id,
        rawScore: outcome.score,
        scanDurationMs: outcome.durationMs,
        scanId: scan.id,
        scanServerIndex: outcome.index,
        scanServerUrl: outcome.url,
        serverAttempts: outcome.attempts,
      });
      const { isFirstTime, updatedScore } = await completeScan(
        scan,
        post.dance_move_id,
        outcome.score,
        true,
      );
      await recordEvent({
        attempt,
        danceMoveId: post.dance_move_id,
        event: "scored",
        isFirstTime,
        ownerId: scan.owner_id,
        postId: scan.post_id,
        rawScore: outcome.score,
        scanDurationMs: outcome.durationMs,
        scanId: scan.id,
        scanServerIndex: outcome.index,
        scanServerUrl: outcome.url,
        serverAttempts: outcome.attempts,
        updatedScore,
      });
    } catch (error) {
      const attempts = scan.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        try {
          const { data: post, error: postError } = await options.supabase
            .from("dance_posts")
            .select("dance_move_id")
            .eq("id", scan.post_id)
            .eq("owner_id", scan.owner_id)
            .maybeSingle();
          if (postError || !post) throw new Error("Could not load dance post for fallback score");
          const rawScore = generateFallbackScore();
          const { isFirstTime, updatedScore } = await completeScan(
            scan,
            post.dance_move_id,
            rawScore,
            false,
          );
          // The recorder makes this a warn: the user is shown a number no scan
          // server produced.
          await recordEvent(
            {
              attempt,
              danceMoveId: post.dance_move_id,
              error: errorMessage(error, "Unknown scan error"),
              event: "fallback",
              isFirstTime,
              ownerId: scan.owner_id,
              postId: scan.post_id,
              rawScore,
              scanId: scan.id,
              serverAttempts: serverAttempts(error),
              updatedScore,
            },
            { err: error },
          );
        } catch (fallbackError) {
          options.logger.error(
            { err: fallbackError, scanId: scan.id },
            "Could not write fallback dance score",
          );
        }
        return;
      }
      const nextRunAt = retryAt(attempts);
      const { error: retryError } = await options.supabase
        .from("dance_scans")
        .update({
          attempts,
          status: "pending",
          next_run_at: nextRunAt,
          locked_at: null,
          error: errorMessage(error, "Unknown scan error"),
        })
        .eq("id", scan.id)
        .eq("status", "processing");
      if (retryError) {
        options.logger.error({ err: retryError, scanId: scan.id }, "Could not retry dance scan");
        return;
      }
      await recordEvent(
        {
          attempt,
          error: errorMessage(error, "Unknown scan error"),
          event: "requeued",
          ownerId: scan.owner_id,
          postId: scan.post_id,
          scanId: scan.id,
          serverAttempts: serverAttempts(error),
        },
        { err: error, nextRunAt, remainingAttempts: MAX_ATTEMPTS - attempts },
      );
      const { error: postError } = await options.supabase
        .from("dance_posts")
        .update({ status: "uploaded" })
        .eq("id", scan.post_id)
        .eq("owner_id", scan.owner_id)
        .eq("status", "scoring");
      if (postError)
        options.logger.error({ err: postError, scanId: scan.id }, "Could not reset dance post");
    }
  }

  /** The post transition belongs to the claim: a claimed scan is a scoring post. */
  async function markPostScoring(scan: ClaimedJob) {
    const { error } = await options.supabase
      .from("dance_posts")
      .update({ status: "scoring" })
      .eq("id", scan.post_id)
      .eq("owner_id", scan.owner_id);
    if (error) throw new Error("Could not mark dance post as scoring");
    // Paired with the outcome recorded after it: a claim with no outcome is a scan
    // still inside the client's multi-minute budget, otherwise silent while it runs.
    await recordEvent({
      attempt: attemptNumber(scan),
      event: "claimed",
      ownerId: scan.owner_id,
      postId: scan.post_id,
      scanId: scan.id,
    });
  }

  return createJobQueue({
    concurrency: options.concurrency,
    logger: options.logger,
    name: "dance scan",
    onClaimed: markPostScoring,
    process: processClaim,
    stuckLockMs: client.maxDurationMs + STUCK_LOCK_GRACE_MS,
    supabase: options.supabase,
    table: "dance_scans",
  });
}

export function startScanWorker(
  app: FastifyInstance,
  options: Omit<ScanWorkerOptions, "logger" | "supabase">,
) {
  const worker = createScanWorker({ ...options, logger: app.log, supabase: app.supabase });
  worker.start();
  app.addHook("onClose", () => worker.stop());
  return worker;
}
