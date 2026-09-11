import { describe, expect, it } from "vitest";
import { coerceScanStatus } from "../status.ts";

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
