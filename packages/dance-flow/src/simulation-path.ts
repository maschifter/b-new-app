// Dependency-free on purpose: `./dev` re-exports the predicate and is imported by a
// host app's root layout, which must not pull `expo-file-system` or `../api` into its
// module graph.

/** Cache subdirectory the simulated recorder downloads its reference clips into. */
export const SIMULATED_DANCE_RECORDING_DIRECTORY = "dance-recording-simulation";

/**
 * A simulated clip is a shared cached download reused by every later simulated run, so
 * a host app that deletes "the temporary recording" must leave it alone.
 */
export function isSimulatedDanceClipPath(path: string): boolean {
  return path.includes(`/${SIMULATED_DANCE_RECORDING_DIRECTORY}/`);
}
