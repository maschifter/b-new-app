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

export const DANCE_RETENTION_CONFIG = {
  workerEnabled: true,
  /**
   * How long a terminal anonymous post may sit before the sweep takes it. The client
   * deletes its own upload the moment it has read the score, so this window only has to
   * outlast a client that is offline, backgrounded or retrying — a day is that with room
   * to spare, and nothing in Stepz reads a post again after its score.
   */
  postTtlMs: 24 * 60 * 60 * 1000,
  sweepIntervalMs: 5 * 60 * 1000,
  /**
   * Per sweep, not per hour. The backstop only collects the residue of clients that died
   * mid-flow, so it never has to keep pace with the create rate; a bounded batch drains a
   * backlog over hours instead of firing one burst at Storage.
   */
  sweepLimit: 100,
} as const;

/**
 * Per-owner ceiling on `POST /api/dance/posts`, where the global rate limit is the only
 * other bound and each call is a video upload. Generous against real practice — one
 * recording every two minutes for an hour without interruption — and two orders of
 * magnitude below what `RATE_LIMIT_MAX` alone permits.
 */
export const DANCE_POST_RATE_LIMIT = {
  maxPosts: 30,
  windowMs: 60 * 60 * 1000,
} as const;
