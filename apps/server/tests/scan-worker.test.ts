import { describe, expect, it, vi } from "vitest";
import { createScanWorker } from "../src/modules/dance/scan-worker.js";
import { ScanRequestError } from "../src/modules/dance/scanning-client.js";
import { queryBuilder } from "./helpers/supabase.js";

describe("dance scan worker", () => {
  const scan = {
    attempts: 0,
    id: "11111111-1111-4111-8111-111111111111",
    owner_id: "22222222-2222-4222-8222-222222222222",
    post_id: "33333333-3333-4333-8333-333333333333",
  };

  /** The worker now logs at three levels; a bare `error` stub would throw on the rest. */
  const testLogger = () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() });

  const outcome = (score: number, index = 0) => ({
    attempts: [{ durationMs: 1_200, httpStatus: 200, index, url: `https://scan-${index}.example` }],
    durationMs: 1_200,
    index,
    score,
    url: `https://scan-${index}.example`,
  });

  it("does not claim more work when processing scans already fill the concurrency budget", async () => {
    const reaper = queryBuilder({ error: null });
    const activeCount = queryBuilder({ count: 3, error: null });
    const from = vi.fn().mockReturnValueOnce(reaper).mockReturnValueOnce(activeCount);
    const worker = createScanWorker({
      concurrency: 3,
      danceVideoBucket: "dance-videos",
      logger: testLogger() as never,
      scanServerUrls: "https://scan.example",
      supabase: { from } as never,
    });

    await worker.tick();

    expect(activeCount.eq).toHaveBeenCalledWith("status", "processing");
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("does not reap a two-server scan before both timeouts and its safety margin expire", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T00:10:00.000Z"));
    try {
      const reaper = queryBuilder({ error: null });
      const activeCount = queryBuilder({ count: 3, error: null });
      const from = vi.fn().mockReturnValueOnce(reaper).mockReturnValueOnce(activeCount);
      const worker = createScanWorker({
        concurrency: 3,
        danceVideoBucket: "dance-videos",
        logger: testLogger() as never,
        scanServerUrls: "https://scan-one.example,https://scan-two.example",
        supabase: { from } as never,
      });

      await worker.tick();

      expect(reaper.lt).toHaveBeenCalledWith("locked_at", "2026-09-11T00:05:59.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a failed scan to pending with exponential backoff", async () => {
    const reaper = queryBuilder({ error: null });
    const activeCount = queryBuilder({ count: 0, error: null });
    const candidates = queryBuilder({ data: [scan], error: null });
    const claim = queryBuilder({ data: scan, error: null });
    const markScoring = queryBuilder({ error: null });
    const missingPost = queryBuilder({ data: null, error: { message: "missing" } });
    const retry = queryBuilder({ error: null });
    const resetPost = queryBuilder({ error: null });
    const queries = [
      reaper,
      activeCount,
      candidates,
      claim,
      markScoring,
      missingPost,
      retry,
      resetPost,
    ];
    const from = vi.fn(() => {
      const query = queries.shift();
      if (!query) throw new Error("Unexpected Supabase query");
      return query;
    });
    const worker = createScanWorker({
      concurrency: 3,
      danceVideoBucket: "dance-videos",
      logger: testLogger() as never,
      scanServerUrls: "https://scan.example",
      supabase: { from } as never,
    });

    await worker.tick();

    expect(retry.update).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1, status: "pending", locked_at: null }),
    );
    expect(resetPost.update).toHaveBeenCalledWith({ status: "uploaded" });
  });

  it("stores the raw external score and bonus-adjusted score after a successful scan", async () => {
    const reaper = queryBuilder({ error: null });
    const activeCount = queryBuilder({ count: 0, error: null });
    const candidates = queryBuilder({ data: [scan], error: null });
    const claim = queryBuilder({ data: scan, error: null });
    const markScoring = queryBuilder({ error: null });
    const post = queryBuilder({
      data: {
        dance_move_id: "move-id",
        video_path: "owner/post.mp4",
        dance_moves: { film_yourself_video_url: "https://media.example/reference.mp4" },
      },
      error: null,
    });
    const firstTime = queryBuilder({ count: 0, error: null });
    const scorePost = queryBuilder({ data: { id: scan.post_id }, error: null });
    const complete = queryBuilder({ data: { id: scan.id }, error: null });
    const queries = [
      reaper,
      activeCount,
      candidates,
      claim,
      markScoring,
      post,
      firstTime,
      scorePost,
      complete,
    ];
    const from = vi.fn(() => {
      const query = queries.shift();
      if (!query) throw new Error("Unexpected Supabase query");
      return query;
    });
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: "https://signed.example/video" }, error: null });
    const scanRequest = vi.fn().mockResolvedValue(outcome(72));
    const worker = createScanWorker({
      concurrency: 3,
      danceVideoBucket: "dance-videos",
      logger: testLogger() as never,
      scan: scanRequest,
      scanServerUrls: "https://scan.example",
      supabase: { from, storage: { from: vi.fn(() => ({ createSignedUrl })) } } as never,
    });

    await worker.tick();

    expect(createSignedUrl).toHaveBeenCalledWith("owner/post.mp4", 300);
    expect(scanRequest).toHaveBeenCalledWith({
      amateurUrl: "https://signed.example/video",
      expertUrl: "https://media.example/reference.mp4",
      jobId: scan.post_id,
    });
    expect(complete.update).toHaveBeenCalledWith(
      expect.objectContaining({ original_score: 72, updated_score: 80, is_external_score: true }),
    );
    expect(scorePost.update).toHaveBeenCalledWith({ status: "scored", score: 72 });
  });

  it("writes a fallback score after the final failed attempt", async () => {
    const finalAttempt = { ...scan, attempts: 2 };
    const reaper = queryBuilder({ error: null });
    const activeCount = queryBuilder({ count: 0, error: null });
    const candidates = queryBuilder({ data: [finalAttempt], error: null });
    const claim = queryBuilder({ data: finalAttempt, error: null });
    const markScoring = queryBuilder({ error: null });
    const missingPost = queryBuilder({ data: null, error: { message: "missing" } });
    const fallbackMove = queryBuilder({ data: { dance_move_id: "move-id" }, error: null });
    const firstTime = queryBuilder({ count: 0, error: null });
    const scorePost = queryBuilder({ data: { id: scan.post_id }, error: null });
    const complete = queryBuilder({ data: { id: scan.id }, error: null });
    const queries = [
      reaper,
      activeCount,
      candidates,
      claim,
      markScoring,
      missingPost,
      fallbackMove,
      firstTime,
      scorePost,
      complete,
    ];
    const from = vi.fn(() => {
      const query = queries.shift();
      if (!query) throw new Error("Unexpected Supabase query");
      return query;
    });
    const worker = createScanWorker({
      concurrency: 3,
      danceVideoBucket: "dance-videos",
      logger: testLogger() as never,
      scanServerUrls: "https://scan.example",
      supabase: { from } as never,
    });

    await worker.tick();

    expect(complete.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", is_external_score: false }),
    );
    const completeUpdate = complete.update;
    if (!completeUpdate) throw new Error("Expected scan completion update");
    const score = (completeUpdate.mock.calls[0]?.[0] as { original_score: number }).original_score;
    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThanOrEqual(70);
    expect(scorePost.update).toHaveBeenCalledWith({ status: "scored", score });
  });

  it("requeues a scan when scoring the post fails before the scan is completed", async () => {
    const reaper = queryBuilder({ error: null });
    const activeCount = queryBuilder({ count: 0, error: null });
    const candidates = queryBuilder({ data: [scan], error: null });
    const claim = queryBuilder({ data: scan, error: null });
    const markScoring = queryBuilder({ error: null });
    const post = queryBuilder({
      data: {
        dance_move_id: "move-id",
        video_path: "owner/post.mp4",
        dance_moves: { film_yourself_video_url: "https://media.example/reference.mp4" },
      },
      error: null,
    });
    const firstTime = queryBuilder({ count: 0, error: null });
    const scorePost = queryBuilder({ data: null, error: { message: "offline" } });
    const retry = queryBuilder({ error: null });
    const resetPost = queryBuilder({ error: null });
    const queries = [
      reaper,
      activeCount,
      candidates,
      claim,
      markScoring,
      post,
      firstTime,
      scorePost,
      retry,
      resetPost,
    ];
    const from = vi.fn(() => {
      const query = queries.shift();
      if (!query) throw new Error("Unexpected Supabase query");
      return query;
    });
    const worker = createScanWorker({
      concurrency: 3,
      danceVideoBucket: "dance-videos",
      logger: testLogger() as never,
      scan: vi.fn().mockResolvedValue(outcome(72)),
      scanServerUrls: "https://scan.example",
      supabase: {
        from,
        storage: {
          from: vi.fn(() => ({
            createSignedUrl: vi.fn().mockResolvedValue({
              data: { signedUrl: "https://signed.example/video" },
              error: null,
            }),
          })),
        },
      } as never,
    });

    await worker.tick();

    expect(retry.update).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1, status: "pending" }),
    );
    expect(resetPost.update).toHaveBeenCalledWith({ status: "uploaded" });
  });

  it("requeues a scan when recording its completed state fails after the post is scored", async () => {
    const reaper = queryBuilder({ error: null });
    const activeCount = queryBuilder({ count: 0, error: null });
    const candidates = queryBuilder({ data: [scan], error: null });
    const claim = queryBuilder({ data: scan, error: null });
    const markScoring = queryBuilder({ error: null });
    const post = queryBuilder({
      data: {
        dance_move_id: "move-id",
        video_path: "owner/post.mp4",
        dance_moves: { film_yourself_video_url: "https://media.example/reference.mp4" },
      },
      error: null,
    });
    const firstTime = queryBuilder({ count: 0, error: null });
    const scorePost = queryBuilder({ data: { id: scan.post_id }, error: null });
    const complete = queryBuilder({ data: null, error: { message: "offline" } });
    const restorePost = queryBuilder({ data: { id: scan.post_id }, error: null });
    const retry = queryBuilder({ error: null });
    const resetPost = queryBuilder({ error: null });
    const queries = [
      reaper,
      activeCount,
      candidates,
      claim,
      markScoring,
      post,
      firstTime,
      scorePost,
      complete,
      restorePost,
      retry,
      resetPost,
    ];
    const from = vi.fn(() => {
      const query = queries.shift();
      if (!query) throw new Error("Unexpected Supabase query");
      return query;
    });
    const worker = createScanWorker({
      concurrency: 3,
      danceVideoBucket: "dance-videos",
      logger: testLogger() as never,
      scan: vi.fn().mockResolvedValue(outcome(72)),
      scanServerUrls: "https://scan.example",
      supabase: {
        from,
        storage: {
          from: vi.fn(() => ({
            createSignedUrl: vi.fn().mockResolvedValue({
              data: { signedUrl: "https://signed.example/video" },
              error: null,
            }),
          })),
        },
      } as never,
    });

    await worker.tick();

    expect(restorePost.update).toHaveBeenCalledWith({ status: "uploaded", score: null });
    expect(restorePost.eq).toHaveBeenCalledWith("status", "scored");
    expect(retry.update).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1, status: "pending" }),
    );
    expect(resetPost.update).toHaveBeenCalledWith({ status: "uploaded" });
  });
  it("logs which server produced the score and on which attempt", async () => {
    const retriedScan = { ...scan, attempts: 1 };
    const reaper = queryBuilder({ error: null });
    const activeCount = queryBuilder({ count: 0, error: null });
    const candidates = queryBuilder({ data: [retriedScan], error: null });
    const claim = queryBuilder({ data: retriedScan, error: null });
    const markScoring = queryBuilder({ error: null });
    const post = queryBuilder({
      data: {
        dance_move_id: "move-id",
        video_path: "owner/post.mp4",
        dance_moves: { film_yourself_video_url: "https://media.example/reference.mp4" },
      },
      error: null,
    });
    const firstTime = queryBuilder({ count: 0, error: null });
    const scorePost = queryBuilder({ data: { id: scan.post_id }, error: null });
    const complete = queryBuilder({ data: { id: scan.id }, error: null });
    const queries = [
      reaper,
      activeCount,
      candidates,
      claim,
      markScoring,
      post,
      firstTime,
      scorePost,
      complete,
    ];
    const from = vi.fn(() => {
      const query = queries.shift();
      if (!query) throw new Error("Unexpected Supabase query");
      return query;
    });
    const logger = testLogger();
    const worker = createScanWorker({
      concurrency: 3,
      danceVideoBucket: "dance-videos",
      logger: logger as never,
      // The failover server answered, after the first one returned an invalid score.
      scan: vi.fn().mockResolvedValue({
        attempts: [
          {
            durationMs: 900,
            error: "Invalid scan score",
            httpStatus: 200,
            index: 0,
            url: "https://scan-0.example",
          },
          { durationMs: 1_500, httpStatus: 200, index: 1, url: "https://scan-1.example" },
        ],
        durationMs: 1_500,
        index: 1,
        score: 72,
        url: "https://scan-1.example",
      }),
      scanServerUrls: "https://scan-0.example,https://scan-1.example",
      supabase: {
        from,
        storage: {
          from: vi.fn(() => ({
            createSignedUrl: vi.fn().mockResolvedValue({
              data: { signedUrl: "https://signed.example/video" },
              error: null,
            }),
          })),
        },
      } as never,
    });

    await worker.tick();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 2,
        isExternalScore: true,
        postId: scan.post_id,
        rawScore: 72,
        scanServerIndex: 1,
        scanServerUrl: "https://scan-1.example",
        updatedScore: 80,
      }),
      "Dance scan scored",
    );
  });

  it("logs every server tried when an attempt fails and is requeued", async () => {
    const reaper = queryBuilder({ error: null });
    const activeCount = queryBuilder({ count: 0, error: null });
    const candidates = queryBuilder({ data: [scan], error: null });
    const claim = queryBuilder({ data: scan, error: null });
    const markScoring = queryBuilder({ error: null });
    const post = queryBuilder({
      data: {
        dance_move_id: "move-id",
        video_path: "owner/post.mp4",
        dance_moves: { film_yourself_video_url: "https://media.example/reference.mp4" },
      },
      error: null,
    });
    const retry = queryBuilder({ error: null });
    const resetPost = queryBuilder({ error: null });
    const queries = [reaper, activeCount, candidates, claim, markScoring, post, retry, resetPost];
    const from = vi.fn(() => {
      const query = queries.shift();
      if (!query) throw new Error("Unexpected Supabase query");
      return query;
    });
    const failures = [
      {
        durationMs: 90_000,
        index: 0,
        url: "https://scan-0.example",
        error: "The operation timed out",
      },
      {
        durationMs: 120,
        httpStatus: 502,
        index: 1,
        url: "https://scan-1.example",
        error: "HTTP 502",
      },
    ];
    const logger = testLogger();
    const worker = createScanWorker({
      concurrency: 3,
      danceVideoBucket: "dance-videos",
      logger: logger as never,
      scan: vi.fn().mockRejectedValue(new ScanRequestError("All scan servers failed", failures)),
      scanServerUrls: "https://scan-0.example,https://scan-1.example",
      supabase: {
        from,
        storage: {
          from: vi.fn(() => ({
            createSignedUrl: vi.fn().mockResolvedValue({
              data: { signedUrl: "https://signed.example/video" },
              error: null,
            }),
          })),
        },
      } as never,
    });

    await worker.tick();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        remainingAttempts: 2,
        scanId: scan.id,
        serverAttempts: failures,
      }),
      "Dance scan attempt failed; returned it to the queue",
    );
  });
});
