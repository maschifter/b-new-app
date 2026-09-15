export const DANCE_SCAN_CONFIG = {
  danceVideoBucket: "dance-videos",
  scanServerUrls: "https://pose-compare-cem.replit.app,https://pose-compare-2.replit.app",
  workerConcurrency: 3,
  workerEnabled: true,
} as const;

/**
 * Upper bound for a client-supplied audio offset, in milliseconds. It becomes an
 * ffmpeg `-ss` argument, so it is bounded at the request edge rather than left open;
 * the worker clamps it again against the track's real duration.
 */
export const AUDIO_OFFSET_CEILING_MS = 600_000;

export const DANCE_MEDIA_CONFIG = {
  // Referenced, not re-spelled: two literals that must agree eventually will not.
  danceVideoBucket: DANCE_SCAN_CONFIG.danceVideoBucket,
  // One remux at a time is enough for V1 volume and leaves the API's CPU alone. The
  // budget is per replica: claims stay correct under multi-replica, but "one at a time"
  // becomes N with N replicas.
  workerConcurrency: 1,
  workerEnabled: true,
  downloadTimeoutMs: 30_000,
  ffmpegTimeoutMs: 60_000,
  uploadTimeoutMs: 30_000,
  /** Largest object the dance-videos bucket accepts (45 MB), mirroring the migration. */
  maxUploadBytes: 47_185_920,
} as const;

/**
 * Derived rather than configured: the sum of the per-step budgets (two downloads, two
 * ffmpeg runs, two uploads). A hand-picked timeout is a number that drifts away from what
 * the job actually does. At the budgets above this is 240 s, so the reap window is ~5 min
 * with its grace period — the span a single wedged job stalls the queue for.
 */
export const DANCE_MEDIA_JOB_TIMEOUT_MS =
  2 * DANCE_MEDIA_CONFIG.downloadTimeoutMs +
  2 * DANCE_MEDIA_CONFIG.ffmpegTimeoutMs +
  2 * DANCE_MEDIA_CONFIG.uploadTimeoutMs;
