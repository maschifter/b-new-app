/**
 * Which step the result screen is on, pure and hook-free so every branch is a unit
 * test rather than a render.
 */

export type VideoStep = { kind: "none" } | { kind: "save" } | { kind: "replace" };

export interface VideoStepInput {
  hasTemporaryClip: boolean;
  hasPersonalRecording: boolean;
}

/**
 * Document 02 section 3's three states. Without a temporary clip there is nothing to
 * offer, so the screen exits with the saved score and asks nothing.
 */
export function videoStep({ hasTemporaryClip, hasPersonalRecording }: VideoStepInput): VideoStep {
  if (!hasTemporaryClip) return { kind: "none" };
  return hasPersonalRecording ? { kind: "replace" } : { kind: "save" };
}
