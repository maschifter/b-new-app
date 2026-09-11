// Score rules ported from Boogiz. The SCAN_SCORES_SYSTEM bonus table is verbatim
// (score-worker.js); the isFirstTime signal is intentionally per-move here, not
// Boogiz's global first-learned-skill (see plan §Decisions). Only affects the
// stored updated_score, which V1 does not surface.

interface ScoreBracket {
  min: number;
  max: number;
  firstTime: number;
  other: number;
}

// Brackets are inclusive on both ends. Scores of 0 and 96..100 fall in no bracket
// and receive no bonus.
const SCAN_SCORES_SYSTEM: readonly ScoreBracket[] = [
  { min: 1, max: 20, firstTime: 20, other: 15 },
  { min: 21, max: 40, firstTime: 35, other: 18 },
  { min: 41, max: 60, firstTime: 20, other: 18 },
  { min: 61, max: 70, firstTime: 12, other: 10 },
  { min: 71, max: 80, firstTime: 8, other: 6 },
  { min: 81, max: 90, firstTime: 5, other: 0 },
  { min: 91, max: 95, firstTime: 3, other: 0 },
];

/** External scores are integers in 0..100. */
export function isValidExternalScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100
  );
}

/** Bonus added to the raw match score for the matched bracket, else 0. */
export function computeBonus(rawScore: number, isFirstTime: boolean): number {
  const bracket = SCAN_SCORES_SYSTEM.find(
    (candidate) => rawScore >= candidate.min && rawScore <= candidate.max,
  );
  if (!bracket) return 0;
  return isFirstTime ? bracket.firstTime : bracket.other;
}

/** Raw match score plus the bracket bonus (Boogiz updated_score). */
export function finalScore(rawScore: number, isFirstTime: boolean): number {
  return rawScore + computeBonus(rawScore, isFirstTime);
}

export const FALLBACK_SCORE_MIN = 50;
export const FALLBACK_SCORE_MAX = 70;

/**
 * Fallback score when the external scan cannot produce one: a random integer in
 * 50..70 inclusive (Boogiz `Math.floor(random * 21) + 50`). RNG is injected so
 * callers stay deterministic under test.
 */
export function generateFallbackScore(random: () => number = Math.random): number {
  const span = FALLBACK_SCORE_MAX - FALLBACK_SCORE_MIN + 1;
  return Math.floor(random() * span) + FALLBACK_SCORE_MIN;
}
