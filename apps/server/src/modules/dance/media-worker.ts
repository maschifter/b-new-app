import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { mergeAudioOffsetMs } from "@bnewapp/dance-core";
import type { Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { DANCE_MEDIA_JOB_TIMEOUT_MS } from "./config.js";
import {
  type ClaimedJob,
  MAX_ATTEMPTS,
  STUCK_LOCK_GRACE_MS,
  createJobQueue,
  errorMessage,
  retryAt,
} from "./job-queue.js";
import { derivedObjectPaths } from "./media-paths.js";
import { type DanceMediaProcessor, createDanceMediaProcessor } from "./media-processor.js";

const SIGNED_READ_TTL_SECONDS = 5 * 60;

// The sweep is an anti-join over a table that only grows, so it must not run at the tick
// rate: every 30th tick is ~once a minute, bounded to recent posts. Anything older is the
// one-off backfill's problem.
const SWEEP_EVERY_TICKS = 30;
const SWEEP_LIMIT = 20;
const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface MediaWorkerOptions {
  concurrency: number;
  danceVideoBucket: string;
  downloadTimeoutMs: number;
  ffmpegTimeoutMs: number;
  logger: FastifyBaseLogger;
  maxUploadBytes: number;
  process?: DanceMediaProcessor;
  supabase: SupabaseClient<Database>;
  uploadTimeoutMs: number;
}

/** A failure that re-running cannot fix, so it must not burn the remaining attempts. */
class TerminalMediaError extends Error {}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function downloadTo(url: string, destination: string, timeoutMs: number): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok || response.body === null) {
    throw new Error(`Could not download dance media (${response.status})`);
  }
  // Streamed, not buffered: `arrayBuffer()` would spike the whole ~11 MB recording into
  // the heap of a process that is also serving requests.
  await pipeline(
    Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
    createWriteStream(destination),
  );
}

export function createMediaWorker(options: MediaWorkerOptions) {
  const processMedia =
    options.process ?? createDanceMediaProcessor({ ffmpegTimeoutMs: options.ffmpegTimeoutMs });
  const storage = () => options.supabase.storage.from(options.danceVideoBucket);
  let ticksUntilSweep = 0;

  async function runJob(job: ClaimedJob): Promise<void> {
    // The track is resolved through the post's own `music_id`, never through the move's
    // current one: admin can repoint a move after the recording, and merging the new
    // track would mux a song the dancer never heard.
    const { data: post, error: postError } = await options.supabase
      .from("dance_posts")
      .select(
        "video_path, audio_offset_ms, dance_moves(bpm), music_tracks!dance_posts_music_id_fkey(audio_url, delay_before_avatar_dance)",
      )
      .eq("id", job.post_id)
      .eq("owner_id", job.owner_id)
      .maybeSingle();
    if (postError) throw new Error("Could not load dance post for media processing");
    if (!post?.video_path) throw new TerminalMediaError("Dance post has no recording to process");

    const music = post.music_tracks;
    const workDir = await mkdtemp(join(tmpdir(), `dance-media-${job.post_id}-`));
    try {
      const { data: signedRead, error: signedReadError } = await storage().createSignedUrl(
        post.video_path,
        SIGNED_READ_TTL_SECONDS,
      );
      if (signedReadError || !signedRead?.signedUrl) {
        throw new Error("Could not sign dance video for media processing");
      }
      const videoPath = join(workDir, "recording.mp4");
      await downloadTo(signedRead.signedUrl, videoPath, options.downloadTimeoutMs);

      // Extensionless on purpose: `music_tracks.audio_url` is an admin-supplied URL with
      // no enforced mime type, so ffmpeg has to probe the container rather than trust a
      // name we invented.
      let musicPath: string | null = null;
      if (music?.audio_url) {
        musicPath = join(workDir, "music");
        await downloadTo(music.audio_url, musicPath, options.downloadTimeoutMs);
      }

      const result = await processMedia({
        videoPath,
        musicPath,
        audioOffsetMs:
          post.audio_offset_ms ??
          mergeAudioOffsetMs(
            post.dance_moves?.bpm ?? null,
            music?.delay_before_avatar_dance ?? null,
          ),
        workDir,
      });
      if (result.skippedMergeReason !== null) {
        options.logger.info(
          { postId: job.post_id, reason: result.skippedMergeReason },
          "Skipped dance media merge",
        );
      }

      const paths = derivedObjectPaths(job.owner_id, job.post_id);
      let mergedVideoPath: string | null = null;
      if (result.mergedPath !== null) {
        // The bucket limit rejection is deterministic, so checking here costs one attempt
        // instead of three re-downloads that reach the same answer.
        const { size } = await stat(result.mergedPath);
        if (size > options.maxUploadBytes) {
          throw new TerminalMediaError("Merged dance video exceeds the storage size limit");
        }
        await withTimeout(
          storage().upload(paths.mergedVideo, await readFile(result.mergedPath), {
            contentType: "video/mp4",
            upsert: true,
          }),
          options.uploadTimeoutMs,
          "Merged dance video upload",
        ).then(({ error }) => {
          if (error) throw new Error("Could not upload merged dance video");
        });
        mergedVideoPath = paths.mergedVideo;
      }

      await withTimeout(
        storage().upload(paths.thumbnail, await readFile(result.posterPath), {
          contentType: "image/jpeg",
          upsert: true,
        }),
        options.uploadTimeoutMs,
        "Dance poster upload",
      ).then(({ error }) => {
        if (error) throw new Error("Could not upload dance poster");
      });

      // Written before the job is marked completed: a crash in between leaves a retryable
      // job, and both uploads plus this update are idempotent.
      const { error: updateError } = await options.supabase
        .from("dance_posts")
        .update({
          merged_video_path: mergedVideoPath,
          thumbnail_path: paths.thumbnail,
          blurhash: result.blurhash,
        })
        .eq("id", job.post_id)
        .eq("owner_id", job.owner_id);
      if (updateError) throw new Error("Could not store dance post media");
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  async function processClaim(job: ClaimedJob) {
    try {
      await runJob(job);
      const { error } = await options.supabase
        .from("dance_media_jobs")
        .update({ status: "completed", error: null, locked_at: null })
        .eq("id", job.id)
        .eq("status", "processing");
      if (error) throw new Error("Could not complete dance media job");
    } catch (error) {
      const attempts = job.attempts + 1;
      const isTerminal = error instanceof TerminalMediaError || attempts >= MAX_ATTEMPTS;
      // A terminal failure leaves the post untouched: it keeps playing the original
      // silent recording, which is today's behaviour.
      // The only signal a terminal failure produces: the UI stays silent by design, so the
      // log carries everything needed to trace one back to the post the user sees.
      options.logger.error(
        { err: error, jobId: job.id, postId: job.post_id, attempts, terminal: isTerminal },
        "Dance media job failed",
      );
      const { error: updateError } = await options.supabase
        .from("dance_media_jobs")
        .update({
          attempts,
          status: isTerminal ? "failed" : "pending",
          locked_at: null,
          error: errorMessage(error, "Unknown dance media error"),
          ...(isTerminal ? {} : { next_run_at: retryAt(attempts) }),
        })
        .eq("id", job.id)
        .eq("status", "processing");
      if (updateError) {
        options.logger.error(
          { err: updateError, jobId: job.id },
          "Could not update dance media job",
        );
      }
    }
  }

  /**
   * Recovery path for the fail-soft enqueue in `markUploaded`, and the backfill for posts
   * recorded before this shipped. The "no job row" half of the predicate is what keeps it
   * finite: a music-less post and a terminally failed job both keep a null
   * `merged_video_path` forever and are excluded only because their job row exists.
   */
  async function sweepOrphans() {
    const since = new Date(Date.now() - SWEEP_WINDOW_MS).toISOString();
    const { data: orphans, error } = await options.supabase
      .from("dance_posts")
      .select("id, owner_id, dance_media_jobs!left(post_id)")
      .neq("status", "uploading")
      .not("video_path", "is", null)
      .is("merged_video_path", null)
      .is("dance_media_jobs", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(SWEEP_LIMIT);
    if (error) {
      options.logger.error({ err: error }, "Could not sweep for unqueued dance media");
      return;
    }
    if (!orphans?.length) return;

    // Upsert, not insert: a post uploaded between this read and its write is enqueued by
    // `markUploaded` too, and a thrown unique violation would abort the whole batch.
    const { error: enqueueError } = await options.supabase.from("dance_media_jobs").upsert(
      orphans.map((post) => ({ post_id: post.id, owner_id: post.owner_id, status: "pending" })),
      { onConflict: "post_id", ignoreDuplicates: true },
    );
    if (enqueueError) {
      options.logger.error({ err: enqueueError }, "Could not enqueue swept dance media jobs");
    }
  }

  /** Bounded and periodic: the sweep is an anti-join over a table that only grows. */
  async function maybeSweep() {
    if (ticksUntilSweep > 0) {
      ticksUntilSweep -= 1;
      return;
    }
    ticksUntilSweep = SWEEP_EVERY_TICKS - 1;
    await sweepOrphans();
  }

  return createJobQueue({
    concurrency: options.concurrency,
    logger: options.logger,
    name: "dance media job",
    onTickStart: maybeSweep,
    process: processClaim,
    stuckLockMs: DANCE_MEDIA_JOB_TIMEOUT_MS + STUCK_LOCK_GRACE_MS,
    supabase: options.supabase,
    table: "dance_media_jobs",
  });
}

export function startMediaWorker(
  app: FastifyInstance,
  options: Omit<MediaWorkerOptions, "logger" | "supabase">,
) {
  const worker = createMediaWorker({ ...options, logger: app.log, supabase: app.supabase });
  worker.start();
  app.addHook("onClose", () => worker.stop());
  return worker;
}
