import type { Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyBaseLogger } from "fastify";

const TICK_INTERVAL_MS = 2_000;
const RETRY_BASE_MS = 3_000;
const CLAIM_COLUMNS = "id, post_id, owner_id, attempts";

/** Safety margin on top of a job's own budget before its lock counts as abandoned. */
export const STUCK_LOCK_GRACE_MS = 60_000;
export const MAX_ATTEMPTS = 3;

/** The table-as-queue tables. Both carry the same claim columns and status vocabulary. */
export type JobTable = "dance_scans" | "dance_media_jobs";

/**
 * Declared structurally rather than `Pick`ed from one of the two rows: they agree on these
 * four columns, and picking one arbitrarily would imply the other is derived from it.
 */
export interface ClaimedJob {
  id: string;
  post_id: string;
  owner_id: string;
  attempts: number;
}

export interface JobQueueOptions {
  /** Rows allowed in `processing` at once — per replica, not per cluster. */
  concurrency: number;
  logger: FastifyBaseLogger;
  /** Names the queue in log lines; the workers differ only in wording here. */
  name: string;
  /**
   * Runs inside the claim once the row is won, before it is handed to `process`. A throw
   * fails the whole tick, which is the shipped behaviour for the scan worker's post
   * transition.
   */
  onClaimed?: (job: ClaimedJob) => Promise<void>;
  /** Runs at the head of a tick, before reaping. The media worker sweeps for orphans here. */
  onTickStart?: () => Promise<void>;
  /** Owns its own success and failure bookkeeping; the two queues retry very differently. */
  process: (job: ClaimedJob) => Promise<void>;
  /** How long a `processing` lock may sit before the row returns to the queue. */
  stuckLockMs: number;
  supabase: SupabaseClient<Database>;
  table: JobTable;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message.slice(0, 500) : fallback;
}

export function retryAt(attempts: number): string {
  return new Date(Date.now() + RETRY_BASE_MS * 2 ** (attempts - 1)).toISOString();
}

/**
 * The claim/reap/backoff scaffolding both dance queues share: reap abandoned locks, count
 * what is in flight against the concurrency budget, then claim candidates with a
 * conditional `UPDATE … WHERE status = 'pending'` so two replicas cannot take the same row.
 * What a job *does* — and how it retries or fails — stays with its worker.
 */
export function createJobQueue(options: JobQueueOptions) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let isTicking = false;

  async function claim(candidate: ClaimedJob): Promise<ClaimedJob | null> {
    const { data, error } = await options.supabase
      .from(options.table)
      .update({ status: "processing", locked_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .select(CLAIM_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`Could not claim ${options.name}`);
    if (!data) return null;
    await options.onClaimed?.(data);
    return data;
  }

  async function tick() {
    if (isTicking) return;
    isTicking = true;
    try {
      await options.onTickStart?.();

      const now = new Date();
      const { error: reapError } = await options.supabase
        .from(options.table)
        .update({ status: "pending", locked_at: null })
        .eq("status", "processing")
        .lt("locked_at", new Date(now.getTime() - options.stuckLockMs).toISOString());
      if (reapError) {
        options.logger.error({ err: reapError }, `Could not reap stuck ${options.name}s`);
      }

      const { count, error: countError } = await options.supabase
        .from(options.table)
        .select("id", { count: "exact", head: true })
        .eq("status", "processing");
      if (countError) throw new Error(`Could not count active ${options.name}s`);
      const budget = options.concurrency - (count ?? 0);
      if (budget <= 0) return;

      const { data: candidates, error: candidatesError } = await options.supabase
        .from(options.table)
        .select(CLAIM_COLUMNS)
        .eq("status", "pending")
        .lte("next_run_at", now.toISOString())
        .order("created_at", { ascending: true })
        .limit(budget);
      if (candidatesError) throw new Error(`Could not load pending ${options.name}s`);

      // Both callbacks are invoked explicitly: a bare `.map(fn)` would hand the callback
      // the index and the array as extra arguments.
      const claims = await Promise.all((candidates ?? []).map((candidate) => claim(candidate)));
      await Promise.all(
        claims
          .filter((claimed): claimed is ClaimedJob => claimed !== null)
          .map((claimed) => options.process(claimed)),
      );
    } catch (error) {
      // The queue goes in the structured field, not the message: interpolating a name that
      // already starts with "dance" is how you get "Dance dance scan worker tick failed".
      options.logger.error({ err: error, queue: options.name }, "Dance job worker tick failed");
    } finally {
      isTicking = false;
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => void tick(), TICK_INTERVAL_MS);
      void tick();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
    tick,
  };
}
