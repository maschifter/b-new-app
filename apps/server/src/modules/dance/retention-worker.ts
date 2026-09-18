import type { Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { createDanceService } from "./service.js";

interface RetentionWorkerOptions {
  /**
   * The service's own deletion path, injected rather than reimplemented: it already
   * removes the row and all three storage objects, refuses a post that is still
   * uploading, and is idempotent under a retry.
   */
  deletePost: (ownerId: string, postId: string) => Promise<void>;
  logger: FastifyBaseLogger;
  postTtlMs: number;
  supabase: SupabaseClient<Database>;
  sweepIntervalMs: number;
  sweepLimit: number;
}

export function createRetentionWorker(options: RetentionWorkerOptions) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let isSweeping = false;

  async function sweep() {
    // A sweep that overruns its interval must not have a second one started on top of it:
    // both would claim the same candidates and race on the same storage objects.
    if (isSweeping) return;
    isSweeping = true;
    try {
      const olderThan = new Date(Date.now() - options.postTtlMs).toISOString();
      const { data: expired, error } = await options.supabase.rpc(
        "list_expired_anonymous_dance_posts",
        { p_older_than: olderThan, p_limit: options.sweepLimit },
      );
      if (error) throw new Error("Could not list expired anonymous dance posts");
      if (!expired?.length) return;

      // Sequential on purpose: this is unattended cleanup with no deadline, and the
      // batch is sized to drain a backlog over several sweeps rather than to finish one
      // in a burst of parallel Storage calls.
      for (const post of expired) {
        try {
          await options.deletePost(post.owner_id, post.id);
        } catch (deleteError) {
          // The row is deleted before its objects are, so a failure here can leave
          // objects whose row is already gone. The ids are the whole recovery path:
          // every object key is derived from them.
          options.logger.error(
            { err: deleteError, postId: post.id, ownerId: post.owner_id },
            "Could not delete an expired anonymous dance post",
          );
        }
      }
    } catch (error) {
      options.logger.error({ err: error }, "Dance retention sweep failed");
    } finally {
      isSweeping = false;
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => void sweep(), options.sweepIntervalMs);
      void sweep();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
    sweep,
  };
}

export function startRetentionWorker(
  app: FastifyInstance,
  options: Pick<RetentionWorkerOptions, "postTtlMs" | "sweepIntervalMs" | "sweepLimit"> & {
    danceVideoBucket: string;
  },
) {
  const dance = createDanceService(app.supabase, app.httpErrors, options.danceVideoBucket, app.log);
  const worker = createRetentionWorker({
    deletePost: (ownerId, postId) => dance.deleteRecordedPost(ownerId, postId),
    logger: app.log,
    postTtlMs: options.postTtlMs,
    supabase: app.supabase,
    sweepIntervalMs: options.sweepIntervalMs,
    sweepLimit: options.sweepLimit,
  });
  worker.start();
  app.addHook("onClose", () => worker.stop());
  return worker;
}
