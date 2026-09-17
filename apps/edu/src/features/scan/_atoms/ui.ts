import { atom } from "jotai";

/** The step the result screen is on, once the score is terminal. */
export type ScanDecision = "score" | "video" | "done";

/**
 * Plain and unpersisted, which is the mechanism behind document 02 section 2's "if the
 * user goes back or scans again, do not save the unconfirmed result": an unconfirmed
 * attempt has no storage to leave itself in.
 */
export const scanDecisionAtom = atom<ScanDecision>("score");
