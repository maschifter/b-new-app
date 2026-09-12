import type { DancePostStatus, ScanJobState, ScanStatus, ScanStatusRow } from "./types.ts";

const POST_STATUSES: readonly DancePostStatus[] = [
  "uploading",
  "uploaded",
  "scoring",
  "scored",
  "failed",
];

const JOB_STATES: readonly ScanJobState[] = ["pending", "processing", "completed", "failed"];

function coercePostStatus(value: string | null): DancePostStatus {
  return POST_STATUSES.includes(value as DancePostStatus)
    ? (value as DancePostStatus)
    : "uploading";
}

function coerceJobState(value: string | null): ScanJobState {
  return JOB_STATES.includes(value as ScanJobState) ? (value as ScanJobState) : "pending";
}

/** Normalize a raw dance_posts + dance_scans join into the polling DTO. */
export function coerceScanStatus(row: ScanStatusRow): ScanStatus {
  const status = coercePostStatus(row.postStatus);
  const score = typeof row.score === "number" ? row.score : null;
  return {
    status,
    hasScore: score !== null,
    score,
    isExternalScore: row.isExternalScore === true,
    jobState: coerceJobState(row.scanStatus),
  };
}

/** True once the scan reached a terminal state, so the client can stop polling. */
export function shouldFinishScorePolling(status: ScanStatus): boolean {
  return (
    status.hasScore ||
    status.status === "failed" ||
    status.status === "scored" ||
    status.jobState === "failed" ||
    status.jobState === "completed"
  );
}
