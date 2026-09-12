import { createAtomWithMMKV } from "@/lib/jotai/atom-with-mmkv";
import { atom } from "jotai";
import { MMKV } from "react-native-mmkv";

const atomWithDanceMMKV = createAtomWithMMKV(new MMKV({ id: "dance" }));

/** The optional genre filter; null represents the complete published catalog. */
export const selectedDanceGenreIdAtom = atom<string | null>(null);

/** The move the user opened from the catalog, if any. */
export const selectedDanceMoveIdAtom = atom<string | null>(null);

/** Learning-video playback rate, shared by the paged lesson videos. */
export const danceVideoRateAtom = atom(1);

/**
 * The scan the record screen is currently waiting on. `startedAt` powers the
 * non-blocking slow-score hint while the query continues until a terminal result.
 */
export interface ActiveDanceScan {
  postId: string;
  startedAt: number;
}

export const activeDanceScanAtom = atom<ActiveDanceScan | null>(null);

/** Development-only switch surfaced by the global developer menu. */
export const simulatedDanceRecordingEnabledAtom = atomWithDanceMMKV(
  "dance:v1:simulated-recording",
  false,
);

/** Development-only camera selection for recording a different dancer. */
export const useBackDanceCameraAtom = atomWithDanceMMKV("dance:v1:use-back-camera", false);
