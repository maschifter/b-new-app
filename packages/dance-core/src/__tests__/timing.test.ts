import { describe, expect, it } from "vitest";
import {
  DEFAULT_BPM,
  countdownSeconds,
  delayBeforeTimerMs,
  mergeAudioOffsetMs,
  musicSeekSeconds,
} from "../timing.ts";

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

describe("mergeAudioOffsetMs", () => {
  it("reconstructs the record timeline: seek + pre-countdown delay + half the countdown", () => {
    // 5 s seek, countdown of 2 s leaves 3 s of delay, then half the countdown.
    expect(mergeAudioOffsetMs(120, 5000)).toBe(5000 + 3000 + 1000);
  });

  it("uses DEFAULT_BPM for a null bpm", () => {
    const countdownMs = countdownSeconds(null) * 1000;
    expect(mergeAudioOffsetMs(null, 5000)).toBe(
      Math.round(5000 + (5000 - countdownMs) + countdownMs / 2),
    );
  });

  it("is half the countdown when the track has no beat-drop delay", () => {
    expect(mergeAudioOffsetMs(120, null)).toBe(1000);
  });

  it("clamps the pre-countdown wait to zero when the delay is shorter than the countdown", () => {
    // countdownSeconds(60) is 4 s, so the 1 s delay only contributes its whole-second seek.
    expect(mergeAudioOffsetMs(60, 1000)).toBe(1000 + 0 + 2000);
  });

  it("returns a whole number of milliseconds", () => {
    expect(Number.isInteger(mergeAudioOffsetMs(null, 3500))).toBe(true);
  });
});
