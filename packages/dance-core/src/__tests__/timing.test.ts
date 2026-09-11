import { describe, expect, it } from "vitest";
import { DEFAULT_BPM, countdownSeconds, delayBeforeTimerMs, musicSeekSeconds } from "../timing.ts";

describe("countdownSeconds", () => {
  it("is 4 beats at the move's tempo", () => {
    expect(countdownSeconds(120)).toBeCloseTo(2);
    expect(countdownSeconds(60)).toBeCloseTo(4);
  });

  it("falls back to DEFAULT_BPM for null or non-positive bpm", () => {
    const expected = (60 / DEFAULT_BPM) * 4;
    expect(countdownSeconds(null)).toBeCloseTo(expected);
    expect(countdownSeconds(0)).toBeCloseTo(expected);
    expect(countdownSeconds(-10)).toBeCloseTo(expected);
    expect(expected).toBeCloseTo(2.264, 2);
  });
});

describe("musicSeekSeconds", () => {
  it("floors the ms delay to whole seconds", () => {
    expect(musicSeekSeconds(2500)).toBe(2);
    expect(musicSeekSeconds(999)).toBe(0);
  });

  it("treats a null delay as no seek", () => {
    expect(musicSeekSeconds(null)).toBe(0);
  });
});

describe("delayBeforeTimerMs", () => {
  it("subtracts the countdown from the beat-drop delay", () => {
    expect(delayBeforeTimerMs(5000, 120)).toBeCloseTo(3000);
  });

  it("never goes negative when the countdown exceeds the delay", () => {
    expect(delayBeforeTimerMs(1000, 60)).toBe(0);
  });

  it("returns 0 for a null delay", () => {
    expect(delayBeforeTimerMs(null, 120)).toBe(0);
  });
});
