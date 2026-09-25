import { describe, expect, it, vi } from "vitest";
import {
  SCAN_RESPONSE_BODY_LIMIT,
  ScanRequestError,
  createScanningClient,
} from "../src/modules/dance/scanning-client.js";

const request = {
  expertUrl: "https://media.example/expert.mp4",
  amateurUrl: "https://storage.example/amateur.mp4",
  jobId: "11111111-1111-4111-8111-111111111111",
};

describe("scanning client", () => {
  it("posts the documented form body and returns a valid primary score", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ score: 72 }), { status: 200 }));
    const client = createScanningClient({ fetchImpl, serverUrls: "https://scan-one.example" });

    await expect(client.scan(request)).resolves.toMatchObject({
      index: 0,
      score: 72,
      url: "https://scan-one.example",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://scan-one.example",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.body?.toString()).toContain("expert_url=https%3A%2F%2Fmedia.example%2Fexpert.mp4");
    expect(init.body?.toString()).toContain(
      "amateur_url=https%3A%2F%2Fstorage.example%2Famateur.mp4",
    );
  });

  it("fails over after an invalid primary response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ score: 101 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ score: 63 }), { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = createScanningClient({
      fetchImpl,
      serverUrls: "https://scan-one.example, https://scan-two.example",
      sleep,
    });

    const outcome = await client.scan(request);

    // The score names the server that produced it, and carries the failover ahead of it.
    expect(outcome).toMatchObject({ index: 1, score: 63, url: "https://scan-two.example" });
    expect(outcome.attempts).toMatchObject([
      { error: "Invalid scan score", httpStatus: 200, index: 0, url: "https://scan-one.example" },
      { httpStatus: 200, index: 1, url: "https://scan-two.example" },
    ]);
    // The winner carries no error key at all, which is what marks it as the winner.
    expect(outcome.attempts[1]).not.toHaveProperty("error");
    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://scan-two.example", expect.any(Object));
    expect(client.maxDurationMs).toBe(181_000);
  });

  it("reports total scan failure for the worker to retry and eventually fall back", async () => {
    const client = createScanningClient({
      fetchImpl: vi.fn().mockRejectedValue(new Error("offline")),
      serverUrls: "https://scan-one.example",
    });

    await expect(client.scan(request)).rejects.toBeInstanceOf(ScanRequestError);
  });

  it("names each failed server in the message the worker stores on the scan row", async () => {
    const client = createScanningClient({
      fetchImpl: vi
        .fn()
        .mockResolvedValueOnce(new Response("nope", { status: 502 }))
        .mockRejectedValueOnce(new Error("offline")),
      serverUrls: "https://scan-one.example,https://scan-two.example",
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const error = await client.scan(request).catch((thrown: unknown) => thrown);

    if (!(error instanceof ScanRequestError)) throw new Error("Expected a ScanRequestError");
    expect(error.message).toContain("[0] https://scan-one.example: HTTP 502");
    expect(error.message).toContain("[1] https://scan-two.example: offline");
    expect(error.attempts).toMatchObject([
      { httpStatus: 502, index: 0 },
      { httpStatus: undefined, index: 1 },
    ]);
  });

  it("keeps what a failing server said, which HTTP 500 alone does not explain", async () => {
    const client = createScanningClient({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response("<html>\n  <body>Internal Server Error: ffmpeg exited 1</body>\n</html>", {
          status: 500,
        }),
      ),
      serverUrls: "https://scan-one.example",
    });

    const error = await client.scan(request).catch((thrown: unknown) => thrown);

    if (!(error instanceof ScanRequestError)) throw new Error("Expected a ScanRequestError");
    // Collapsed to one line, since this reaches a log line and a database column.
    expect(error.attempts[0]?.responseBody).toBe(
      "<html> <body>Internal Server Error: ffmpeg exited 1</body> </html>",
    );
    expect(error.message).toContain("ffmpeg exited 1");
  });

  it("keeps the body of a response whose score is unusable", async () => {
    const client = createScanningClient({
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ score: 101 }))),
      serverUrls: "https://scan-one.example",
    });

    const error = await client.scan(request).catch((thrown: unknown) => thrown);

    if (!(error instanceof ScanRequestError)) throw new Error("Expected a ScanRequestError");
    expect(error.attempts[0]).toMatchObject({
      error: "Invalid scan score",
      httpStatus: 200,
      responseBody: '{"score":101}',
    });
  });

  it("truncates a long body rather than putting a whole error page in a column", async () => {
    const client = createScanningClient({
      fetchImpl: vi.fn().mockResolvedValue(new Response("x".repeat(5_000), { status: 502 })),
      serverUrls: "https://scan-one.example",
    });

    const error = await client.scan(request).catch((thrown: unknown) => thrown);

    if (!(error instanceof ScanRequestError)) throw new Error("Expected a ScanRequestError");
    expect(error.attempts[0]?.responseBody).toHaveLength(SCAN_RESPONSE_BODY_LIMIT);
  });

  it("times the whole call, not just the server that answered", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn()
        // The first server burns 30s before failing; the second answers in 2s.
        .mockImplementationOnce(async () => {
          vi.advanceTimersByTime(30_000);
          return new Response("gateway timeout", { status: 504 });
        })
        .mockImplementationOnce(async () => {
          vi.advanceTimersByTime(2_000);
          return new Response(JSON.stringify({ score: 63 }));
        });
      const client = createScanningClient({
        fetchImpl,
        serverUrls: "https://scan-one.example,https://scan-two.example",
        // The failover delay is part of the total, so spend it on the clock too.
        sleep: async (ms) => {
          vi.advanceTimersByTime(ms);
        },
      });

      const outcome = await client.scan(request);

      // durationMs sees only the winner; totalDurationMs sees the 30s that preceded it.
      expect(outcome.durationMs).toBe(2_000);
      expect(outcome.totalDurationMs).toBe(33_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
