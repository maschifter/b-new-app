import { coerceSnapshot, isRecordingFileName, isValidScore } from "./coerce";
import type { LearnedMove, LearnedMoveSnapshot, PersonalRecording } from "./types";

/**
 * The collection rules, pure and total: no storage, no React, no I/O. `now` is
 * injected so the caller owns the clock.
 *
 * Writes enforce the same predicate the reader coerces against, so a record the
 * writer accepts can never be one the next launch drops.
 */

export interface RecordFirstScanInput {
  moveId: string;
  score: number;
  isExternalScore: boolean;
  snapshot: LearnedMoveSnapshot;
}

/** Creates the learned move and saves its first score. A repeat call changes nothing. */
export function recordFirstScan(
  moves: Record<string, LearnedMove>,
  input: RecordFirstScanInput,
  now: string,
): Record<string, LearnedMove> {
  if (moves[input.moveId] !== undefined) return moves;
  if (!isValidScore(input.score)) return moves;
  const snapshot = coerceSnapshot(input.snapshot);
  if (snapshot === null) return moves;
  return {
    ...moves,
    [input.moveId]: {
      moveId: input.moveId,
      savedScore: input.score,
      isExternalScore: input.isExternalScore,
      learnedAt: now,
      updatedAt: now,
      move: snapshot,
    },
  };
}

/**
 * Replacement, not best-of: a confirmed lower score replaces a higher one.
 * Only the user's explicit save reaches this.
 */
export function saveConfirmedScore(
  moves: Record<string, LearnedMove>,
  moveId: string,
  score: number,
  isExternalScore: boolean,
  now: string,
): Record<string, LearnedMove> {
  const existing = moves[moveId];
  if (existing === undefined) return moves;
  if (!isValidScore(score)) return moves;
  return {
    ...moves,
    [moveId]: { ...existing, savedScore: score, isExternalScore, updatedAt: now },
  };
}

/** Arithmetic mean of the saved scores, unrounded. `null` at zero learned moves. */
export function averageScore(moves: Record<string, LearnedMove>): number | null {
  const learned = Object.values(moves);
  if (learned.length === 0) return null;
  const total = learned.reduce((sum, move) => sum + move.savedScore, 0);
  return total / learned.length;
}

export function learnedCount(moves: Record<string, LearnedMove>): number {
  return Object.keys(moves).length;
}

/** The numerator only; the catalog totals are a server aggregate this app does not hold. */
export function learnedCountByGenre(moves: Record<string, LearnedMove>, genreId: string): number {
  return Object.values(moves).filter((move) => move.move.genreIds.includes(genreId)).length;
}

/** At most one recording per move; saving again replaces the entry. */
export function savePersonalRecording(
  recordings: Record<string, PersonalRecording>,
  recording: PersonalRecording,
): Record<string, PersonalRecording> {
  if (recording.moveId.length === 0) return recordings;
  if (!isRecordingFileName(recording.fileName)) return recordings;
  if (!Number.isFinite(recording.durationS) || recording.durationS <= 0) return recordings;
  return { ...recordings, [recording.moveId]: recording };
}

/** Deleting a recording never touches the learned move or its saved score. */
export function deletePersonalRecording(
  recordings: Record<string, PersonalRecording>,
  moveId: string,
): Record<string, PersonalRecording> {
  if (recordings[moveId] === undefined) return recordings;
  const next = { ...recordings };
  delete next[moveId];
  return next;
}
