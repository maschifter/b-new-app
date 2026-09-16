import { atom } from "jotai";
import { activeDanceScanAtom } from "./ui";

/** Starts score polling only after the upload endpoint has queued the scan. */
export const startDanceScorePollingAtom = atom(null, (get, set, postId: string) => {
  const activeScan = get(activeDanceScanAtom);
  if (activeScan?.postId !== postId) set(activeDanceScanAtom, { postId, startedAt: Date.now() });
});
