// Public API of the shared dance domain. Pure TypeScript — no React, RN, expo,
// or Fastify — so the mobile app and the server worker consume the same scoring,
// status, and Record-screen timing rules.

export type {
  DancePostStatus,
  ScanJobState,
  ScanStatus,
  ScanStatusRow,
} from "./types.ts";
export {
  computeBonus,
  finalScore,
  isValidExternalScore,
  generateFallbackScore,
  FALLBACK_SCORE_MIN,
  FALLBACK_SCORE_MAX,
} from "./scoring.ts";
export {
  DEFAULT_BPM,
  countdownSeconds,
  musicSeekSeconds,
  delayBeforeTimerMs,
} from "./timing.ts";
export { coerceScanStatus } from "./status.ts";
