import { describe, expect, it, vi } from "vitest";
import { type ScanEvent, createScanEventRecorder } from "../src/modules/dance/scan-events.js";
import { queryBuilder } from "./helpers/supabase.js";

const IDS = {
  danceMoveId: "44444444-4444-4444-8444-444444444444",
  ownerId: "22222222-2222-4222-8222-222222222222",
  postId: "33333333-3333-4333-8333-333333333333",
  scanId: "11111111-1111-4111-8111-111111111111",
};

const base = { attempt: 1, ownerId: IDS.ownerId, postId: IDS.postId, scanId: IDS.scanId };

const scored: ScanEvent = {
  ...base,
  attempt: 2,
  danceMoveId: IDS.danceMoveId,
  event: "scored",
  isFirstTime: true,
  rawScore: 60,
  scanDurationMs: 18_429,
  scanServerIndex: 1,
  scanServerUrl: "https://scan-1.example",
  serverAttempts: [
    {
      durationMs: 900,
      error: "HTTP 502",
      httpStatus: 502,
      index: 0,
      url: "https://scan-0.example",
    },
    { durationMs: 18_429, httpStatus: 200, index: 1, url: "https://scan-1.example" },
  ],
  updatedScore: 80,
};

function setup(result: Parameters<typeof queryBuilder>[0] = { error: null }) {
  const query = queryBuilder(result);
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const from = vi.fn(() => query);
  const recorder = createScanEventRecorder({
    logger: logger as never,
    supabase: { from } as never,
  });
  return { from, logger, query, recorder };
}

describe("dance scan event recorder", () => {
  it("records which server produced a score, and marks it external", async () => {
    const { from, logger, query, recorder } = setup();

    await recorder.record(scored);

    expect(from).toHaveBeenCalledWith("dance_scan_events");
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 2,
        dance_move_id: IDS.danceMoveId,
        event: "scored",
        is_external_score: true,
        is_first_time: true,
        post_id: IDS.postId,
        raw_score: 60,
        scan_duration_ms: 18_429,
        scan_server_index: 1,
        scan_server_url: "https://scan-1.example",
        updated_score: 80,
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(expect.anything(), "Dance scan scored");
  });

  it("keeps every server tried on the row, so a failover survives the post's deletion", async () => {
    const { query, recorder } = setup();

    await recorder.record(scored);

    const row = query.insert?.mock.calls[0]?.[0] as { server_attempts: unknown[] };
    expect(row.server_attempts).toEqual([
      {
        durationMs: 900,
        error: "HTTP 502",
        httpStatus: 502,
        index: 0,
        url: "https://scan-0.example",
      },
      { durationMs: 18_429, httpStatus: 200, index: 1, url: "https://scan-1.example" },
    ]);
  });

  it("marks a fallback score as not external and warns", async () => {
    const { logger, query, recorder } = setup();

    await recorder.record({
      ...base,
      attempt: 3,
      danceMoveId: IDS.danceMoveId,
      error: "All scan servers failed",
      event: "fallback",
      isFirstTime: true,
      rawScore: 58,
      serverAttempts: [],
      updatedScore: 78,
    });

    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 3,
        error: "All scan servers failed",
        event: "fallback",
        is_external_score: false,
        raw_score: 58,
        updated_score: 78,
      }),
    );
    // A generated score is the one a reader must be able to find; info would bury it.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.anything(),
      "Dance scan exhausted its attempts; wrote a fallback score",
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("leaves scoring columns unset for a claim, which has reached no score", async () => {
    const { query, recorder } = setup();

    await recorder.record({ ...base, event: "claimed" });

    const row = query.insert?.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row).toEqual({
      attempt: 1,
      event: "claimed",
      is_external_score: null,
      owner_id: IDS.ownerId,
      post_id: IDS.postId,
      scan_id: IDS.scanId,
    });
  });

  it("does not fail a scan when the audit row cannot be written", async () => {
    const { logger, recorder } = setup({ error: { message: "audit table offline" } });

    await expect(recorder.record(scored)).resolves.toBeUndefined();

    // The scan itself still succeeded and was logged; only the durable copy was lost.
    expect(logger.info).toHaveBeenCalledWith(expect.anything(), "Dance scan scored");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "scored", scanId: IDS.scanId }),
      "Could not record a dance scan event",
    );
  });

  it("records the scan server's answer without the bonus the write has yet to compute", async () => {
    const { logger, query, recorder } = setup();

    await recorder.record({
      ...base,
      danceMoveId: IDS.danceMoveId,
      event: "answered",
      rawScore: 60,
      scanDurationMs: 13_725,
      scanServerIndex: 0,
      scanServerUrl: "https://scan-0.example",
      serverAttempts: [
        { durationMs: 13_725, httpStatus: 200, index: 0, url: "https://scan-0.example" },
      ],
    });

    const row = query.insert?.mock.calls[0]?.[0] as Record<string, unknown>;
    // An external score, even though the attempt has not completed yet.
    expect(row.is_external_score).toBe(true);
    expect(row.raw_score).toBe(60);
    expect(row.scan_server_url).toBe("https://scan-0.example");
    // Both are computed inside the write this event precedes.
    expect(row.updated_score).toBeUndefined();
    expect(row.is_first_time).toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(expect.anything(), "Dance scan server answered");
  });
});
