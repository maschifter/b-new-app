import { describe, expect, it } from "vitest";
import { coerceScanStatus, isDancePostStatus, shouldFinishScorePolling } from "../status.ts";
import type { ScanStatus } from "../types.ts";

function status(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return {
    status: "scoring",
    hasScore: false,
    score: null,
    isExternalScore: false,
    jobState: "processing",
    ...overrides,
  };
}

describe("coerceScanStatus", () => {
  it("normalizes a scored post with an external score", () => {
    expect(
      coerceScanStatus({
        postStatus: "scored",
        score: 82,
        scanStatus: "completed",
        isExternalScore: true,
      }),
    ).toEqual({
      status: "scored",
      hasScore: true,
      score: 82,
      isExternalScore: true,
      jobState: "completed",
    });
  });

  it("reports no score while still scoring", () => {
    expect(
      coerceScanStatus({
        postStatus: "scoring",
        score: null,
        scanStatus: "processing",
        isExternalScore: false,
      }),
    ).toEqual({
      status: "scoring",
      hasScore: false,
      score: null,
      isExternalScore: false,
      jobState: "processing",
    });
  });

  it("falls back to safe defaults for unknown or missing values", () => {
    expect(
      coerceScanStatus({
        postStatus: "bogus",
        score: null,
        scanStatus: null,
        isExternalScore: null,
      }),
    ).toEqual({
      status: "uploading",
      hasScore: false,
      score: null,
      isExternalScore: false,
      jobState: "pending",
    });
  });
});

describe("shouldFinishScorePolling", () => {
  it("keeps polling while the scan is still in flight", () => {
    expect(shouldFinishScorePolling(status())).toBe(false);
    expect(shouldFinishScorePolling(status({ jobState: "pending" }))).toBe(false);
  });

  it("stops for every terminal state, including failures without a score", () => {
    expect(shouldFinishScorePolling(status({ hasScore: true, score: 96 }))).toBe(true);
    expect(shouldFinishScorePolling(status({ status: "failed" }))).toBe(true);
    expect(shouldFinishScorePolling(status({ status: "scored" }))).toBe(true);
    expect(shouldFinishScorePolling(status({ jobState: "failed" }))).toBe(true);
    expect(shouldFinishScorePolling(status({ jobState: "completed" }))).toBe(true);
  });
});

describe("isDancePostStatus", () => {
  it("accepts every stored post status", () => {
    for (const status of ["uploading", "uploaded", "scoring", "scored", "failed"]) {
      expect(isDancePostStatus(status)).toBe(true);
    }
  });

  it("rejects an unknown or missing status instead of defaulting it", () => {
    expect(isDancePostStatus("archived")).toBe(false);
    expect(isDancePostStatus("")).toBe(false);
    expect(isDancePostStatus(null)).toBe(false);
  });
});
