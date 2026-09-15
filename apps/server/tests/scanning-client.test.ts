import { describe, expect, it, vi } from "vitest";
import { ScanRequestError, createScanningClient } from "../src/modules/dance/scanning-client.js";

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

    await expect(client.scan(request)).resolves.toBe(72);
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

    await expect(client.scan(request)).resolves.toBe(63);
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
});
