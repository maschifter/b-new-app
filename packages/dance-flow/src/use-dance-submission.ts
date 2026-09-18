import type { ScanStatus } from "@bnewapp/types";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { startDanceScorePollingAtom } from "./_atoms/effects";
import { submitDanceRecordingMutationAtom } from "./_atoms/mutations";
import { danceScoreAtom } from "./_atoms/queries";
import { activeDanceScanAtom } from "./_atoms/ui";
import { isScorePollingSlow } from "./score-polling";
import { type SubmissionState, deriveSubmissionState } from "./ui/submission-state";

export interface DanceSubmissionOptions {
  moveId: string;
  /** Local `file://` path of the captured clip. */
  clipPath: string;
  clipDuration: number;
  /** Music playhead at the first recorded frame; absent when the player never started. */
  clipAudioOffsetMs?: number | undefined;
}

export interface DanceSubmission {
  /** The upload and the score poll mapped onto the one message a screen shows. */
  submission: SubmissionState;
  /** The polled status, for a screen that needs more than the message carries. */
  scoreStatus: ScanStatus | undefined;
  /** The flow can go no further: a score arrived, or scoring failed for good. */
  isTerminal: boolean;
  /** Re-runs the upload after a retryable failure. */
  retry: () => void;
  /**
   * The created post id. Readable after the unmount cleanup has cleared
   * `activeDanceScanAtom`, and stable, so an effect can call it without re-running.
   */
  getSubmittedPostId: () => string | null;
}

/**
 * Submits the captured clip on mount, starts score polling once the post exists and
 * reports both as one state. The sequence belongs to the flow because both host apps
 * run exactly it; what each app then does with the result is its own.
 */
export function useDanceSubmission({
  moveId,
  clipPath,
  clipDuration,
  clipAudioOffsetMs,
}: DanceSubmissionOptions): DanceSubmission {
  const [activeScan, setActiveScan] = useAtom(activeDanceScanAtom);
  const startScorePolling = useSetAtom(startDanceScorePollingAtom);
  const submit = useAtomValue(submitDanceRecordingMutationAtom);
  const score = useAtomValue(danceScoreAtom);

  const submissionInput = useMemo(
    () => ({
      danceMoveId: moveId,
      path: clipPath,
      videoLength: clipDuration,
      // Spread, not `audioOffsetMs: clipAudioOffsetMs`: exactOptionalPropertyTypes makes
      // an explicit undefined a type error, and a measured 0 must survive as 0.
      ...(clipAudioOffsetMs === undefined ? {} : { audioOffsetMs: clipAudioOffsetMs }),
    }),
    [clipAudioOffsetMs, clipDuration, clipPath, moveId],
  );

  useEffect(() => {
    submit.mutate(submissionInput);
    return () => setActiveScan(null);
  }, [setActiveScan, submissionInput, submit.mutate]);

  const postIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (submit.isSuccess && submit.data !== undefined) {
      postIdRef.current = submit.data;
      startScorePolling(submit.data);
    }
  }, [startScorePolling, submit.data, submit.isSuccess]);

  const submission = deriveSubmissionState({
    hasClip: true,
    isUploading: submit.isPending,
    uploadError: submit.error ?? null,
    isScanning: activeScan !== null,
    isScorePollingSlow: activeScan !== null && isScorePollingSlow(activeScan.startedAt),
    score: score.data,
    scoreError: score.error ?? null,
  });

  const retry = useCallback(() => {
    submit.mutate(submissionInput);
  }, [submissionInput, submit.mutate]);

  const getSubmittedPostId = useCallback(() => postIdRef.current, []);

  return {
    submission,
    scoreStatus: score.data,
    isTerminal: submission.kind === "scored" || submission.kind === "failed",
    retry,
    getSubmittedPostId,
  };
}
