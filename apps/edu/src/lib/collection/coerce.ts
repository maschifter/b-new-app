import type { LearnedMove, LearnedMoveSnapshot, PersonalRecording } from "./types";

/**
 * Persisted JSON is untrusted: it survives app upgrades and can be partially
 * written. Every map is coerced entry by entry, so one malformed record is
 * dropped without taking the collection with it.
 */

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

function coerceTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

export function coerceSnapshot(value: unknown): LearnedMoveSnapshot | null {
  if (!isRecordObject(value)) return null;
  const { title, thumbnailUrl, genreIds, level, videoUrl } = value;
  if (typeof title !== "string") return null;
  if (thumbnailUrl !== null && typeof thumbnailUrl !== "string") return null;
  if (!Array.isArray(genreIds)) return null;
  if (typeof level !== "number" || !Number.isInteger(level) || level < 1) return null;
  if (typeof videoUrl !== "string" || videoUrl.length === 0) return null;
  return {
    title,
    thumbnailUrl,
    genreIds: genreIds.filter((id): id is string => typeof id === "string"),
    level,
    videoUrl,
  };
}

function coerceLearnedMove(key: string, value: unknown): LearnedMove | null {
  if (!isRecordObject(value)) return null;
  const { moveId, savedScore, isExternalScore, learnedAt, updatedAt, move } = value;
  if (typeof moveId !== "string" || moveId !== key) return null;
  if (!isValidScore(savedScore)) return null;
  const learned = coerceTimestamp(learnedAt);
  if (learned === null) return null;
  const snapshot = coerceSnapshot(move);
  if (snapshot === null) return null;
  return {
    moveId,
    savedScore,
    // A record can only predate the flag by being partially written, and `true`
    // keeps its score counting — what every score does here.
    isExternalScore: typeof isExternalScore === "boolean" ? isExternalScore : true,
    learnedAt: learned,
    updatedAt: coerceTimestamp(updatedAt) ?? learned,
    move: snapshot,
  };
}

function coercePersonalRecording(key: string, value: unknown): PersonalRecording | null {
  if (!isRecordObject(value)) return null;
  const { moveId, fileUri, createdAt, durationS } = value;
  if (typeof moveId !== "string" || moveId !== key) return null;
  if (typeof fileUri !== "string" || fileUri.length === 0) return null;
  const created = coerceTimestamp(createdAt);
  if (created === null) return null;
  if (typeof durationS !== "number" || !Number.isFinite(durationS) || durationS <= 0) return null;
  return { moveId, fileUri, createdAt: created, durationS };
}

function coerceMap<T>(
  value: unknown,
  coerceEntry: (key: string, entry: unknown) => T | null,
): Record<string, T> {
  if (!isRecordObject(value)) return {};
  const result: Record<string, T> = {};
  for (const [key, entry] of Object.entries(value)) {
    const coerced = coerceEntry(key, entry);
    if (coerced !== null) result[key] = coerced;
  }
  return result;
}

export function coerceLearnedMoves(value: unknown): Record<string, LearnedMove> {
  return coerceMap(value, coerceLearnedMove);
}

export function coercePersonalRecordings(value: unknown): Record<string, PersonalRecording> {
  return coerceMap(value, coercePersonalRecording);
}
