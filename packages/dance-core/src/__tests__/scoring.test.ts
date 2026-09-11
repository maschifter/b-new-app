import { describe, expect, it } from "vitest";
import {
  FALLBACK_SCORE_MAX,
  FALLBACK_SCORE_MIN,
  computeBonus,
  finalScore,
  generateFallbackScore,
  isValidExternalScore,
} from "../scoring.ts";

describe("computeBonus (SCAN_SCORES_SYSTEM verbatim)", () => {
  it("adds the first-time bonus for the matched bracket", () => {
    expect(computeBonus(1, true)).toBe(20);
    expect(computeBonus(20, true)).toBe(20);
    expect(computeBonus(21, true)).toBe(35);
    expect(computeBonus(40, true)).toBe(35);
    expect(computeBonus(60, true)).toBe(20);
    expect(computeBonus(70, true)).toBe(12);
    expect(computeBonus(80, true)).toBe(8);
    expect(computeBonus(90, true)).toBe(5);
    expect(computeBonus(95, true)).toBe(3);
  });

  it("adds the repeat (other) bonus when not first time", () => {
    expect(computeBonus(20, false)).toBe(15);
    expect(computeBonus(40, false)).toBe(18);
    expect(computeBonus(60, false)).toBe(18);
    expect(computeBonus(70, false)).toBe(10);
    expect(computeBonus(80, false)).toBe(6);
    expect(computeBonus(90, false)).toBe(0);
    expect(computeBonus(95, false)).toBe(0);
  });

  it("gives no bonus for scores in no bracket (0 and 96..100)", () => {
    expect(computeBonus(0, true)).toBe(0);
    expect(computeBonus(0, false)).toBe(0);
    expect(computeBonus(96, true)).toBe(0);
    expect(computeBonus(100, true)).toBe(0);
    expect(computeBonus(100, false)).toBe(0);
  });
});

describe("finalScore", () => {
  it("is the raw score plus the bracket bonus", () => {
    expect(finalScore(30, true)).toBe(65);
    expect(finalScore(30, false)).toBe(48);
    expect(finalScore(100, true)).toBe(100);
  });
});

describe("isValidExternalScore", () => {
  it("accepts integers in 0..100", () => {
    expect(isValidExternalScore(0)).toBe(true);
    expect(isValidExternalScore(100)).toBe(true);
    expect(isValidExternalScore(73)).toBe(true);
  });

  it("rejects decimals, out-of-range, non-numeric, and non-finite values", () => {
    expect(isValidExternalScore(50.5)).toBe(false);
    expect(isValidExternalScore(-1)).toBe(false);
    expect(isValidExternalScore(101)).toBe(false);
    expect(isValidExternalScore(Number.NaN)).toBe(false);
    expect(isValidExternalScore(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidExternalScore("50")).toBe(false);
    expect(isValidExternalScore(null)).toBe(false);
    expect(isValidExternalScore(undefined)).toBe(false);
  });
});

describe("generateFallbackScore", () => {
  it("spans 50..70 inclusive at the RNG extremes", () => {
    expect(generateFallbackScore(() => 0)).toBe(FALLBACK_SCORE_MIN);
    expect(generateFallbackScore(() => 0.9999999)).toBe(FALLBACK_SCORE_MAX);
  });

  it("stays within bounds across the RNG range", () => {
    for (const value of [0, 0.1, 0.25, 0.5, 0.75, 0.99]) {
      const score = generateFallbackScore(() => value);
      expect(score).toBeGreaterThanOrEqual(FALLBACK_SCORE_MIN);
      expect(score).toBeLessThanOrEqual(FALLBACK_SCORE_MAX);
      expect(Number.isInteger(score)).toBe(true);
    }
  });
});
