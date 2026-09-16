// Client-side polling policy for a queued scan. Kept dependency-free so both the
// query atom and the presentational mapping can read it without pulling in the
// network layer.

export const SCORE_POLL_INITIAL_INTERVAL_MS = 2_000;
export const SCORE_POLL_MAX_INTERVAL_MS = 5_000;
export const SCORE_POLL_SLOW_THRESHOLD_MS = 90_000;

/** Gradually reduce polling pressure while a scan is still running. */
export function scorePollIntervalMs(successfulPolls: number): number {
  const additionalDelay = Math.max(successfulPolls - 1, 0) * 1_000;
  return Math.min(SCORE_POLL_INITIAL_INTERVAL_MS + additionalDelay, SCORE_POLL_MAX_INTERVAL_MS);
}

export function isScorePollingSlow(startedAt: number, now = Date.now()): boolean {
  return now - startedAt >= SCORE_POLL_SLOW_THRESHOLD_MS;
}
