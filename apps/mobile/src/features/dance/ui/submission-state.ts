import { shouldFinishScorePolling } from "@bnewapp/dance-core";
import type { ScanStatus } from "@bnewapp/types";

export type SubmissionState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "scanning"; isSlow: boolean }
  | { kind: "scored"; score: number }
  | { kind: "failed"; message: string; canRetry: boolean };

export interface SubmissionInput {
  hasClip: boolean;
  isUploading: boolean;
  uploadError: Error | null;
  isScanning: boolean;
  isScorePollingSlow: boolean;
  score: ScanStatus | undefined;
  scoreError: Error | null;
}

/**
 * Maps the upload mutation and the score query onto the one message the screen
 * shows. Kept free of hooks so every branch is unit-testable.
 */
export function deriveSubmissionState(input: SubmissionInput): SubmissionState {
  if (!input.hasClip) return { kind: "idle" };
  if (input.isUploading) return { kind: "uploading" };
  if (input.uploadError) {
    return {
      kind: "failed",
      message: "Couldn't submit your dance. Please try again.",
      canRetry: true,
    };
  }
  if (input.scoreError)
    return { kind: "failed", message: "Couldn't check your dance score.", canRetry: false };
  if (input.score) {
    if (input.score.hasScore && input.score.score !== null) {
      return { kind: "scored", score: input.score.score };
    }
    if (!shouldFinishScorePolling(input.score)) {
      return { kind: "scanning", isSlow: input.isScorePollingSlow };
    }
    return {
      kind: "failed",
      message: "Dance scoring failed. Please record another attempt.",
      canRetry: false,
    };
  }
  return input.isScanning
    ? { kind: "scanning", isSlow: input.isScorePollingSlow }
    : { kind: "uploading" };
}
