import { persistedEduAtom } from "@/lib/jotai/atom-with-mmkv";
import { atom } from "jotai";
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

export const deletePersonalRecordingAtom = atom(null, (get, set, moveId: string) => {
  const recordings = get(personalRecordingsAtom);
  set(personalRecordingsStorageAtom, deletePersonalRecording(recordings, moveId));
});
