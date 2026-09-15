// Record-screen timing math ported from Boogiz. Shared with the mobile component
// so the countdown, music seek, and beat-drop gate stay identical.

/** Boogiz `payload…music_bpm || 106` — covers the nullable dance_moves.bpm. */
export const DEFAULT_BPM = 106;

/**
 * Countdown length in seconds: 4 beats at the move's tempo
 * (`(60 / bpm) * 4`). A null or non-positive bpm falls back to DEFAULT_BPM.
 */
export function countdownSeconds(bpm: number | null): number {
  const effectiveBpm = bpm && bpm > 0 ? bpm : DEFAULT_BPM;
  return (60 / effectiveBpm) * 4;
}

/**
 * Seconds to seek the music track to so it starts at the beat-drop (Boogiz
 * `getAudioSeekTime = floor(delayBeforeAvatarDance / 1000)`). Null delay → 0.
 */
export function musicSeekSeconds(delayMs: number | null): number {
  return Math.floor((delayMs ?? 0) / 1000);
}

/**
 * Milliseconds to wait on the DELAY_BEFORE_AVATAR_DANCE step before advancing to
 * TIMER (Boogiz `delayForTimer = max(delayBeforeAvatarDance − countdown, 0)`).
 * Null delay → 0 (graceful "music from the start").
 */
export function delayBeforeTimerMs(delayMs: number | null, bpm: number | null): number {
  return Math.max((delayMs ?? 0) - countdownSeconds(bpm) * 1000, 0);
}

/**
 * Music playhead position, in milliseconds, at the first recorded frame — the
 * fallback used to seek the track when merging a post whose device-measured
 * offset is missing. Reconstructs the Record-screen timeline: seek to the
 * beat-drop, wait out the pre-countdown delay, then half the countdown.
 *
 * `countdownSeconds(bpm) * 500` is the timeline's `countdownCompletionMs(countDown) / 2`
 * reduced, so this stays a leaf and does not import from record-flow.ts.
 */
export function mergeAudioOffsetMs(bpm: number | null, delayMs: number | null): number {
  return Math.round(
    musicSeekSeconds(delayMs) * 1000 +
      delayBeforeTimerMs(delayMs, bpm) +
      countdownSeconds(bpm) * 500,
  );
}
