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
