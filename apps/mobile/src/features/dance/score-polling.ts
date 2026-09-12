// Client-side polling policy for a queued scan. Kept dependency-free so both the
// query atom and the presentational mapping can read it without pulling in the
// network layer.

export const SCORE_POLL_INTERVAL_MS = 2_000;
export const SCORE_POLL_TIMEOUT_MS = 120_000;
export const SCORE_POLL_MAX_ATTEMPTS = 3;

/** Raised when a scan is still in flight after SCORE_POLL_TIMEOUT_MS. */
export class DanceScoreTimeoutError extends Error {
  constructor() {
    super("Dance scoring timed out");
    this.name = "DanceScoreTimeoutError";
  }
}
