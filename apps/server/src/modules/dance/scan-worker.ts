import { finalScore, generateFallbackScore } from "@bnewapp/dance-core";
import type { Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { createScanningClient } from "./scanning-client.js";

const TICK_INTERVAL_MS = 2_000;
const STUCK_LOCK_GRACE_MS = 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 3_000;

type ClaimedScan = Pick<
  Database["public"]["Tables"]["dance_scans"]["Row"],
  "id" | "post_id" | "owner_id" | "attempts"
>;

interface ScanWorkerOptions {
  concurrency: number;
  danceVideoBucket: string;
  logger: FastifyBaseLogger;
  scan?: (request: { amateurUrl: string; expertUrl: string; jobId: string }) => Promise<number>;
  scanServerUrls: string;
  supabase: SupabaseClient<Database>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown scan error";
}

function retryAt(attempts: number): string {
  return new Date(Date.now() + RETRY_BASE_MS * 2 ** (attempts - 1)).toISOString();
}

export function createScanWorker(options: ScanWorkerOptions) {
  const client = createScanningClient({ serverUrls: options.scanServerUrls });
  const performScan = options.scan ?? ((request) => client.scan(request));
  const stuckLockMs = client.maxDurationMs + STUCK_LOCK_GRACE_MS;
  let timer: ReturnType<typeof setInterval> | undefined;
  let isTicking = false;

  async function completeScan(
    scan: ClaimedScan,
    danceMoveId: string,
    rawScore: number,
    isExternalScore: boolean,
  ) {
    const { count, error: firstTimeError } = await options.supabase
      .from("dance_posts")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", scan.owner_id)
      .eq("dance_move_id", danceMoveId)
      .eq("status", "scored");
    if (firstTimeError) throw new Error("Could not determine first dance attempt");

    const updatedScore = finalScore(rawScore, (count ?? 0) === 0);
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
    if (!scanError && completedScan) return;

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

  async function processClaim(scan: ClaimedScan) {
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

      const rawScore = await performScan({
        expertUrl: post.dance_moves.film_yourself_video_url,
        amateurUrl: signedRead.signedUrl,
        jobId: scan.post_id,
      });
      await completeScan(scan, post.dance_move_id, rawScore, true);
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
          await completeScan(scan, post.dance_move_id, generateFallbackScore(), false);
        } catch (fallbackError) {
          options.logger.error(
            { err: fallbackError, scanId: scan.id },
            "Could not write fallback dance score",
          );
        }
        return;
      }
      const { error: retryError } = await options.supabase
        .from("dance_scans")
        .update({
          attempts,
          status: "pending",
          next_run_at: retryAt(attempts),
          locked_at: null,
          error: errorMessage(error),
        })
        .eq("id", scan.id)
        .eq("status", "processing");
      if (retryError) {
        options.logger.error({ err: retryError, scanId: scan.id }, "Could not retry dance scan");
        return;
      }
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

  async function tick() {
    if (isTicking) return;
    isTicking = true;
    try {
      const now = new Date();
      const { error: reapError } = await options.supabase
        .from("dance_scans")
        .update({ status: "pending", locked_at: null })
        .eq("status", "processing")
        .lt("locked_at", new Date(now.getTime() - stuckLockMs).toISOString());
      if (reapError) options.logger.error({ err: reapError }, "Could not reap stuck dance scans");

      const { count, error: countError } = await options.supabase
        .from("dance_scans")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing");
      if (countError) throw new Error("Could not count active dance scans");
      const budget = options.concurrency - (count ?? 0);
      if (budget <= 0) return;

      const { data: candidates, error: candidatesError } = await options.supabase
        .from("dance_scans")
        .select("id, post_id, owner_id, attempts")
        .eq("status", "pending")
        .lte("next_run_at", now.toISOString())
        .order("created_at", { ascending: true })
        .limit(budget);
      if (candidatesError) throw new Error("Could not load pending dance scans");

      const claims = await Promise.all(
        (candidates ?? []).map(async (candidate) => {
          const { data, error } = await options.supabase
            .from("dance_scans")
            .update({ status: "processing", locked_at: new Date().toISOString() })
            .eq("id", candidate.id)
            .eq("status", "pending")
            .select("id, post_id, owner_id, attempts")
            .maybeSingle();
          if (error) throw new Error("Could not claim dance scan");
          if (!data) return null;
          const { error: postError } = await options.supabase
            .from("dance_posts")
            .update({ status: "scoring" })
            .eq("id", data.post_id)
            .eq("owner_id", data.owner_id);
          if (postError) throw new Error("Could not mark dance post as scoring");
          return data;
        }),
      );
      await Promise.all(
        claims.filter((claim): claim is ClaimedScan => claim !== null).map(processClaim),
      );
    } catch (error) {
      options.logger.error({ err: error }, "Dance scan worker tick failed");
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

export function startScanWorker(
  app: FastifyInstance,
  options: Omit<ScanWorkerOptions, "logger" | "supabase">,
) {
  const worker = createScanWorker({ ...options, logger: app.log, supabase: app.supabase });
  worker.start();
  app.addHook("onClose", () => worker.stop());
  return worker;
}
