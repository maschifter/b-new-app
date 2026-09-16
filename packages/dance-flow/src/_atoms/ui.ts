import { atom } from "jotai";
import { persistedDanceAtom } from "../config";

/**
 * The scan the record screen is currently waiting on. `startedAt` powers the
 * non-blocking slow-score hint while the query continues until a terminal result.
 */
export interface ActiveDanceScan {
  postId: string;
  startedAt: number;
}

export const activeDanceScanAtom = atom<ActiveDanceScan | null>(null);

/** Development-only switch surfaced by the host app's developer menu. */
export const simulatedDanceRecordingEnabledAtom = persistedDanceAtom("simulated-recording", false);

/** Development-only camera selection for recording a different dancer. */
export const useBackDanceCameraAtom = persistedDanceAtom("use-back-camera", false);
