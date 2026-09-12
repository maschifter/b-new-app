import { describe, expect, it } from "vitest";
import {
  FilmStep,
  countdownCompletionMs,
  countdownPhases,
  isFilmMusicPlaying,
} from "../record-flow.ts";

describe("record flow", () => {
  it("orders the steps so the camera starts only after the countdown", () => {
    expect(FilmStep.READY).toBeLessThan(FilmStep.DELAY_BEFORE_AVATAR_DANCE);
    expect(FilmStep.DELAY_BEFORE_AVATAR_DANCE).toBeLessThan(FilmStep.TIMER);
    expect(FilmStep.TIMER).toBeLessThan(FilmStep.START_CAMERA);
    expect(FilmStep.START_CAMERA).toBeLessThan(FilmStep.RECORDING);
    expect(FilmStep.RECORDING).toBeLessThan(FilmStep.STOP);
    expect(FilmStep.STOP).toBeLessThan(FilmStep.FINISHED);
  });

  it("keeps music playing through STOP and pauses only after FINISHED", () => {
    expect(isFilmMusicPlaying(FilmStep.READY)).toBe(false);
    expect(isFilmMusicPlaying(FilmStep.DELAY_BEFORE_AVATAR_DANCE)).toBe(true);
    expect(isFilmMusicPlaying(FilmStep.RECORDING)).toBe(true);
    expect(isFilmMusicPlaying(FilmStep.STOP)).toBe(true);
    expect(isFilmMusicPlaying(FilmStep.FINISHED)).toBe(false);
  });

  it("spaces the 3-2-1-Go countdown evenly across its duration", () => {
    expect(countdownPhases(2.4)).toEqual([
      { label: "3", afterMs: 0 },
      { label: "2", afterMs: 600 },
      { label: "1", afterMs: 1_200 },
      { label: "Go", afterMs: 1_800 },
    ]);
    expect(countdownCompletionMs(2.4)).toBe(2_400);
  });

  it("clamps a negative duration instead of scheduling phases in the past", () => {
    expect(countdownPhases(-1).every((phase) => phase.afterMs === 0)).toBe(true);
    expect(countdownCompletionMs(-1)).toBe(0);
  });
});
