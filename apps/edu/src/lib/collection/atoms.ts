import { persistedEduAtom } from "@/lib/jotai/atom-with-mmkv";
import { type Setter, atom } from "jotai";
import { atomFamily } from "jotai-family";
import { coerceLearnedMoves, coercePersonalRecordings } from "./coerce";
import {
  type RecordFirstScanInput,
  averageScore,
  averageScorePercent,
  deletePersonalRecording,
  learnedCount,
  learnedCountByGenre,
  learnedMovesByGenre,
  recordFirstScan,
  saveConfirmedScore,
  savePersonalRecording,
} from "./collection";
import type { LearnedMove, PersonalRecording } from "./types";

// Typed `unknown` and never read directly: the exported reads derive from them
// through coercion, so no consumer can see an unvalidated shape.
const learnedMovesStorageAtom = persistedEduAtom<unknown>("learned-moves", {});
const personalRecordingsStorageAtom = persistedEduAtom<unknown>("personal-recordings", {});

export const learnedMovesAtom = atom<Record<string, LearnedMove>>((get) =>
  coerceLearnedMoves(get(learnedMovesStorageAtom)),
);

export const personalRecordingsAtom = atom<Record<string, PersonalRecording>>((get) =>
  coercePersonalRecordings(get(personalRecordingsStorageAtom)),
);

export const averageScoreAtom = atom((get) => averageScore(get(learnedMovesAtom)));

export const learnedCountAtom = atom((get) => learnedCount(get(learnedMovesAtom)));

export const averageScorePercentAtom = atom((get) => averageScorePercent(get(learnedMovesAtom)));

export const learnedCountByGenreAtomFamily = atomFamily((genreId: string) =>
  atom((get) => learnedCountByGenre(get(learnedMovesAtom), genreId)),
);

/**
 * One sorted list per genre, so a section that re-renders for its neighbour does not
 * re-sort. The profile reads its section count off this list rather than counting the
 * same predicate twice.
 */
export const learnedMovesByGenreAtomFamily = atomFamily((genreId: string) =>
  atom((get) => learnedMovesByGenre(get(learnedMovesAtom), genreId)),
);

export const recordFirstScanAtom = atom(null, (get, set, input: RecordFirstScanInput) => {
  const moves = get(learnedMovesAtom);
  set(learnedMovesStorageAtom, recordFirstScan(moves, input, new Date().toISOString()));
});

export interface SaveConfirmedScoreInput {
  moveId: string;
  score: number;
  isExternalScore: boolean;
}

export const saveConfirmedScoreAtom = atom(
  null,
  (get, set, { moveId, score, isExternalScore }: SaveConfirmedScoreInput) => {
    const moves = get(learnedMovesAtom);
    set(
      learnedMovesStorageAtom,
      saveConfirmedScore(moves, moveId, score, isExternalScore, new Date().toISOString()),
    );
  },
);

export interface SavePersonalRecordingInput {
  moveId: string;
  fileName: string;
  durationS: number;
}

export const savePersonalRecordingAtom = atom(
  null,
  (get, set, { moveId, fileName, durationS }: SavePersonalRecordingInput) => {
    const recordings = get(personalRecordingsAtom);
    set(
      personalRecordingsStorageAtom,
      savePersonalRecording(recordings, {
        moveId,
        fileName,
        durationS,
        createdAt: new Date().toISOString(),
      }),
    );
  },
);

/**
 * Reports whether the removal reached the disk. `atomWithStorage` writes its in-memory
 * value before it persists, so a rejected write would otherwise drop the record from the
 * screen while the device still holds it, with nothing left to retry from.
 */
export const deletePersonalRecordingAtom = atom(null, (get, set, moveId: string): boolean => {
  const stored = get(personalRecordingsStorageAtom);
  const next = deletePersonalRecording(get(personalRecordingsAtom), moveId);
  if (persistRecordings(set, next)) return true;
  // The in-memory value goes back even when this write cannot reach the disk the first
  // one failed on: the disk still holds the record, so the two agree again either way.
  persistRecordings(set, stored);
  return false;
});

function persistRecordings(set: Setter, recordings: unknown): boolean {
  try {
    set(personalRecordingsStorageAtom, recordings);
    return true;
  } catch {
    return false;
  }
}
