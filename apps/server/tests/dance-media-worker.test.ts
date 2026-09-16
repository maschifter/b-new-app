import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DanceMediaProcessor } from "../src/modules/dance/media-processor.js";
import { createMediaWorker } from "../src/modules/dance/media-worker.js";
import { queryBuilder } from "./helpers/supabase.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const BLURHASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

const job = { attempts: 0, id: JOB_ID, owner_id: OWNER_ID, post_id: POST_ID };

function postRow(overrides: Record<string, unknown> = {}) {
  return {
    video_path: `${OWNER_ID}/${POST_ID}.mp4`,
    audio_offset_ms: 4200,
    dance_moves: { bpm: 120 },
    music_tracks: { audio_url: "https://media.example/track.mp3", delay_before_avatar_dance: 8000 },
    ...overrides,
  };
}

/** Writes real files into the job's temp dir, so the worker's stat/read path is exercised. */
function fakeProcessor(options: { mergedBytes?: number } = {}) {
  return vi.fn<DanceMediaProcessor>(async ({ workDir, musicPath }) => {
    const posterPath = join(workDir, "poster.jpg");
    await writeFile(posterPath, Buffer.alloc(64));
    if (musicPath === null) {
      return { mergedPath: null, posterPath, blurhash: BLURHASH, skippedMergeReason: "no music" };
    }
    const mergedPath = join(workDir, "merged.mp4");
    await writeFile(mergedPath, Buffer.alloc(options.mergedBytes ?? 1024));
    return { mergedPath, posterPath, blurhash: BLURHASH, skippedMergeReason: null };
  });
}

function storageStub() {
  return {
    createSignedUrl: vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: "https://signed.example/recording" }, error: null }),
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  };
}

interface HarnessOptions {
  maxUploadBytes?: number;
  process?: DanceMediaProcessor;
  queries: ReturnType<typeof queryBuilder>[];
  storage?: ReturnType<typeof storageStub>;
}

function harness({ queries, ...rest }: HarnessOptions) {
  const remaining = [...queries];
  const from = vi.fn(() => {
    const query = remaining.shift();
    if (!query) throw new Error("Unexpected Supabase query");
    return query;
  });
  const storage = rest.storage ?? storageStub();
  const logger = { error: vi.fn(), info: vi.fn() };
  const worker = createMediaWorker({
    concurrency: 1,
    danceVideoBucket: "dance-videos",
    downloadTimeoutMs: 5_000,
    ffmpegTimeoutMs: 5_000,
    logger: logger as never,
    maxUploadBytes: rest.maxUploadBytes ?? 47_185_920,
    uploadTimeoutMs: 5_000,
    ...(rest.process ? { process: rest.process } : {}),
    supabase: { from, storage: { from: vi.fn(() => storage) } } as never,
  });
  return { from, logger, storage, worker };
}

function stubDownloads() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([0, 1, 2, 3]), { status: 200 })),
  );
}

/** Sweep + reap + count, the three queries every tick issues before it can claim. */
function tickPreamble(activeCount: number) {
  return [
    queryBuilder({ data: [], error: null }),
    queryBuilder({ error: null }),
    queryBuilder({ count: activeCount, error: null }),
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dance media worker", () => {
  it("does not claim work while processing jobs already fill the concurrency budget", async () => {
    const preamble = tickPreamble(1);
    const { from, worker } = harness({ queries: preamble });

    await worker.tick();

    expect(preamble[2]?.eq).toHaveBeenCalledWith("status", "processing");
    expect(from).toHaveBeenCalledTimes(3);
  });

  it("reaps a lock only after the summed step budgets and the grace window expire", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T00:10:00.000Z"));
    try {
      const preamble = tickPreamble(1);
      const { worker } = harness({ queries: preamble });

      await worker.tick();

      // 240 s of step budgets + 60 s grace.
      expect(preamble[1]?.lt).toHaveBeenCalledWith("locked_at", "2026-09-15T00:05:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("claims conditionally so a row taken by another replica is skipped", async () => {
    const claim = queryBuilder({ data: null, error: null });
    const { from, worker } = harness({
      queries: [...tickPreamble(0), queryBuilder({ data: [job], error: null }), claim],
    });

    await worker.tick();

    expect(claim.eq).toHaveBeenCalledWith("status", "pending");
    expect(from).toHaveBeenCalledTimes(5);
  });

  it("merges the track frozen onto the post, not the move's current one", async () => {
    stubDownloads();
    const post = queryBuilder({ data: postRow(), error: null });
    const process = fakeProcessor();
    const { storage, worker } = harness({
      process,
      queries: [
        ...tickPreamble(0),
        queryBuilder({ data: [job], error: null }),
        queryBuilder({ data: job, error: null }),
        post,
        queryBuilder({ data: { id: POST_ID }, error: null }),
        queryBuilder({ error: null }),
      ],
    });

    await worker.tick();

    expect(post.select).toHaveBeenCalledWith(
      expect.stringContaining("music_tracks!dance_posts_music_id_fkey"),
    );
    expect(process).toHaveBeenCalledWith(expect.objectContaining({ audioOffsetMs: 4200 }));
    expect(storage.upload).toHaveBeenCalledWith(
      `${OWNER_ID}/${POST_ID}-merged.mp4`,
      expect.anything(),
      { contentType: "video/mp4", upsert: true },
    );
    expect(storage.upload).toHaveBeenCalledWith(`${OWNER_ID}/${POST_ID}.jpg`, expect.anything(), {
      contentType: "image/jpeg",
      upsert: true,
    });
  });

  it("falls back to the computed timeline offset when the device never measured one", async () => {
    stubDownloads();
    const process = fakeProcessor();
    const { worker } = harness({
      process,
      queries: [
        ...tickPreamble(0),
        queryBuilder({ data: [job], error: null }),
        queryBuilder({ data: job, error: null }),
        queryBuilder({ data: postRow({ audio_offset_ms: null }), error: null }),
        queryBuilder({ data: { id: POST_ID }, error: null }),
        queryBuilder({ error: null }),
      ],
    });

    await worker.tick();

    // mergeAudioOffsetMs(120, 8000): 8000 seek + 6000 pre-countdown wait + 1000 half-countdown.
    expect(process).toHaveBeenCalledWith(expect.objectContaining({ audioOffsetMs: 15_000 }));
  });

  it("stores a poster and blurhash but no merged path for a post without music", async () => {
    stubDownloads();
    const update = queryBuilder({ data: { id: POST_ID }, error: null });
    const { storage, worker } = harness({
      process: fakeProcessor(),
      queries: [
        ...tickPreamble(0),
        queryBuilder({ data: [job], error: null }),
        queryBuilder({ data: job, error: null }),
        queryBuilder({ data: postRow({ music_tracks: null }), error: null }),
        update,
        queryBuilder({ error: null }),
      ],
    });

    await worker.tick();

    expect(update.update).toHaveBeenCalledWith({
      merged_video_path: null,
      thumbnail_path: `${OWNER_ID}/${POST_ID}.jpg`,
      blurhash: BLURHASH,
    });
    expect(storage.upload).toHaveBeenCalledOnce();
  });

  it("fails an oversized merge terminally on its first attempt instead of re-downloading twice", async () => {
    stubDownloads();
    const failed = queryBuilder({ error: null });
    const { storage, worker } = harness({
      maxUploadBytes: 512,
      process: fakeProcessor({ mergedBytes: 1024 }),
      queries: [
        ...tickPreamble(0),
        queryBuilder({ data: [job], error: null }),
        queryBuilder({ data: job, error: null }),
        queryBuilder({ data: postRow(), error: null }),
        failed,
      ],
    });

    await worker.tick();

    expect(failed.update).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1, status: "failed", locked_at: null }),
    );
    expect(failed.update?.mock.calls[0]?.[0]).not.toHaveProperty("next_run_at");
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("returns a transient failure to pending with exponential backoff", async () => {
    const retry = queryBuilder({ error: null });
    const { worker } = harness({
      process: fakeProcessor(),
      queries: [
        ...tickPreamble(0),
        queryBuilder({ data: [job], error: null }),
        queryBuilder({ data: job, error: null }),
        queryBuilder({ data: null, error: { message: "unreachable" } }),
        retry,
      ],
    });

    await worker.tick();

    expect(retry.update).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1, status: "pending", locked_at: null }),
    );
    expect(retry.update?.mock.calls[0]?.[0]).toHaveProperty("next_run_at");
  });

  it("marks the job failed after the final attempt and leaves the post untouched", async () => {
    const failed = queryBuilder({ error: null });
    const { worker } = harness({
      process: fakeProcessor(),
      queries: [
        ...tickPreamble(0),
        queryBuilder({ data: [{ ...job, attempts: 2 }], error: null }),
        queryBuilder({ data: { ...job, attempts: 2 }, error: null }),
        queryBuilder({ data: null, error: { message: "unreachable" } }),
        failed,
      ],
    });

    await worker.tick();

    expect(failed.update).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 3, status: "failed" }),
    );
  });

  it("enqueues posts that have a recording but neither a merge nor a job row", async () => {
    const sweep = queryBuilder({
      data: [{ id: POST_ID, owner_id: OWNER_ID, dance_media_jobs: null }],
      error: null,
    });
    const enqueue = queryBuilder({ error: null });
    const { worker } = harness({
      queries: [
        sweep,
        enqueue,
        queryBuilder({ error: null }),
        queryBuilder({ count: 1, error: null }),
      ],
    });

    await worker.tick();

    // The anti-join is what keeps the sweep finite: a music-less post and a terminally
    // failed job both keep merged_video_path null forever.
    expect(sweep.select).toHaveBeenCalledWith(
      expect.stringContaining("dance_media_jobs!left(post_id)"),
    );
    expect(sweep.is).toHaveBeenCalledWith("dance_media_jobs", null);
    expect(sweep.is).toHaveBeenCalledWith("merged_video_path", null);
    expect(sweep.neq).toHaveBeenCalledWith("status", "uploading");
    expect(sweep.not).toHaveBeenCalledWith("video_path", "is", null);
    expect(enqueue.upsert).toHaveBeenCalledWith(
      [{ post_id: POST_ID, owner_id: OWNER_ID, status: "pending" }],
      { ignoreDuplicates: true, onConflict: "post_id" },
    );
  });

  it("sweeps on the first tick only, so the anti-join is not a 0.5 Hz full-table scan", async () => {
    const { from, logger, worker } = harness({
      queries: [
        ...tickPreamble(1),
        queryBuilder({ error: null }),
        queryBuilder({ count: 1, error: null }),
      ],
    });

    await worker.tick();
    await worker.tick();

    // Three queries for the sweeping tick, two for the one that skips it.
    expect(from).toHaveBeenCalledTimes(5);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "cleans derived uploads when deletion races processing (upload failure: %s)",
    async (failUpload) => {
      stubDownloads();
      const storage = storageStub();
      if (failUpload)
        storage.upload
          .mockResolvedValueOnce({ error: null })
          .mockRejectedValueOnce(new Error("offline"));
      const { worker } = harness({
        process: fakeProcessor(),
        storage,
        queries: [
          ...tickPreamble(0),
          queryBuilder({ data: [job], error: null }),
          queryBuilder({ data: job, error: null }),
          queryBuilder({ data: postRow(), error: null }),
          queryBuilder({ data: null, error: null }),
          queryBuilder({ error: null }),
        ],
      });

      await worker.tick();

      expect(storage.remove).toHaveBeenCalledWith([
        `${OWNER_ID}/${POST_ID}-merged.mp4`,
        `${OWNER_ID}/${POST_ID}.jpg`,
      ]);
    },
  );

  it("completes a job whose post was deleted before it could be processed", async () => {
    const storage = storageStub();
    const completed = queryBuilder({ error: null });
    const { logger, worker } = harness({
      process: fakeProcessor(),
      storage,
      queries: [
        ...tickPreamble(0),
        queryBuilder({ data: [job], error: null }),
        queryBuilder({ data: job, error: null }),
        queryBuilder({ data: null, error: null }),
        completed,
      ],
    });

    await worker.tick();

    expect(storage.remove).toHaveBeenCalledWith([
      `${OWNER_ID}/${POST_ID}-merged.mp4`,
      `${OWNER_ID}/${POST_ID}.jpg`,
    ]);
    expect(completed.update).toHaveBeenCalledWith({
      status: "completed",
      error: null,
      locked_at: null,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("records the original failure when cleaning up after it fails too", async () => {
    stubDownloads();
    const storage = storageStub();
    storage.upload
      .mockResolvedValueOnce({ error: null })
      .mockRejectedValueOnce(new Error("poster gone"));
    const retry = queryBuilder({ error: null });
    const { logger, worker } = harness({
      process: fakeProcessor(),
      storage,
      queries: [
        ...tickPreamble(0),
        queryBuilder({ data: [job], error: null }),
        queryBuilder({ data: job, error: null }),
        queryBuilder({ data: postRow(), error: null }),
        queryBuilder({ data: null, error: { message: "unreachable" } }),
        retry,
      ],
    });

    await worker.tick();

    expect(storage.remove).not.toHaveBeenCalled();
    expect(retry.update).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1, status: "pending", error: "poster gone" }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID }),
      "Could not clean up dance media for a deleted post",
    );
  });
});
