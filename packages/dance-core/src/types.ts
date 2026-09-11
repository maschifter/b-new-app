// Domain contract for the dance flow. Pure data shapes only — no UI, no storage,
// no React, no Fastify — so the server worker and the mobile app build against
// the same rules.

/** dance_posts lifecycle: the user-facing status of a recorded attempt. */
export type DancePostStatus = "uploading" | "uploaded" | "scoring" | "scored" | "failed";

/** dance_scans queue state: the worker's view of the scan job. */
export type ScanJobState = "pending" | "processing" | "completed" | "failed";

/** Normalized scan status returned by the polling endpoint. */
export interface ScanStatus {
  status: DancePostStatus;
  hasScore: boolean;
  score: number | null;
  isExternalScore: boolean;
  jobState: ScanJobState;
}

/** Loosely-typed join of dance_posts + dance_scans, as read from the database. */
export interface ScanStatusRow {
  postStatus: string | null;
  score: number | null;
  scanStatus: string | null;
  isExternalScore: boolean | null;
}
