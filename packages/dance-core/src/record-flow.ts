// Record-screen flow state ported from Boogiz. Pure data + math so the countdown,
// music gate, and step order are testable without a camera or a React tree.

/** The recording flow is deliberately explicit so timing and audio gates stay in sync. */
export enum FilmStep {
  READY = 0,
  DELAY_BEFORE_AVATAR_DANCE = 1,
  TIMER = 2,
  START_CAMERA = 3,
  RECORDING = 4,
  STOP = 5,
  FINISHED = 6,
}

/** Music runs from the beat-drop gate until the clip is handed to the upload flow. */
export function isFilmMusicPlaying(step: FilmStep): boolean {
  return step >= FilmStep.DELAY_BEFORE_AVATAR_DANCE && step < FilmStep.FINISHED;
}

export interface CountdownPhase {
  label: string;
  afterMs: number;
}

/** The 3-2-1-Go labels, evenly spaced across the bpm-derived countdown. */
export function countdownPhases(durationSeconds: number): CountdownPhase[] {
  const sliceMs = countdownCompletionMs(durationSeconds) / 4;
  return [
    { label: "3", afterMs: 0 },
    { label: "2", afterMs: sliceMs },
    { label: "1", afterMs: sliceMs * 2 },
    { label: "Go", afterMs: sliceMs * 3 },
  ];
}

export function countdownCompletionMs(durationSeconds: number): number {
  return Math.max(durationSeconds, 0) * 1_000;
}
