import type { ScanStatus } from "@bnewapp/types";
import { type SubmissionInput, deriveSubmissionState } from "../submission-state";

function input(overrides: Partial<SubmissionInput> = {}): SubmissionInput {
  return {
    hasClip: true,
    isUploading: false,
    uploadError: null,
    isScanning: false,
    isScorePollingSlow: false,
    score: undefined,
    scoreError: null,
    ...overrides,
  };
}

function scanStatus(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return {
    status: "scored",
    hasScore: true,
    score: 96,
    isExternalScore: false,
    jobState: "completed",
    ...overrides,
  };
}

it("stays idle until a clip exists", () => {
  expect(deriveSubmissionState(input({ hasClip: false }))).toEqual({ kind: "idle" });
});

it("reports the upload before the scan", () => {
  expect(deriveSubmissionState(input({ isUploading: true }))).toEqual({ kind: "uploading" });
  expect(deriveSubmissionState(input({ isScanning: true }))).toEqual({
    kind: "scanning",
    isSlow: false,
  });
});

it("treats a clip waiting on its mutation as uploading", () => {
  expect(deriveSubmissionState(input())).toEqual({ kind: "uploading" });
});

it("offers a retry only for a failed upload", () => {
  expect(deriveSubmissionState(input({ uploadError: new Error("boom") }))).toEqual({
    kind: "failed",
    message: "Couldn't submit your dance. Please try again.",
    canRetry: true,
  });
});

it("keeps scanning with a non-blocking hint after the soft threshold", () => {
  expect(deriveSubmissionState(input({ isScanning: true, isScorePollingSlow: true }))).toEqual({
    kind: "scanning",
    isSlow: true,
  });
  expect(
    deriveSubmissionState(input({ isScanning: true, scoreError: new Error("network blip") })),
  ).toEqual({
    kind: "failed",
    message: "Couldn't check your dance score.",
    canRetry: false,
  });
});

it("reports the score, and a terminal scan without one as a failure", () => {
  expect(deriveSubmissionState(input({ isScanning: true, score: scanStatus() }))).toEqual({
    kind: "scored",
    score: 96,
  });
  expect(
    deriveSubmissionState(
      input({
        isScanning: true,
        score: scanStatus({ status: "failed", hasScore: false, score: null }),
      }),
    ),
  ).toEqual({
    kind: "failed",
    message: "Dance scoring failed. Please record another attempt.",
    canRetry: false,
  });
});

it("keeps showing scanning while a score response is still in flight", () => {
  expect(
    deriveSubmissionState(
      input({
        isScanning: true,
        score: scanStatus({
          status: "scoring",
          hasScore: false,
          score: null,
          jobState: "processing",
        }),
      }),
    ),
  ).toEqual({ kind: "scanning", isSlow: false });
});
