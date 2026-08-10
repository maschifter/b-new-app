import type { DecorationSnapshot } from "./types.ts";

// The snapshot carries a version number so structural upgrades (e.g. single
// room -> multiple rooms) can still read old data. Migration is explicit: on
// load, if version < CURRENT_VERSION, run an ordered migrator chain to upgrade
// the shape *before* rendering (design §6). The chain is wired now so future
// version bumps are a one-line addition, not a refactor.

export const CURRENT_VERSION = 2;

type Migrator = (input: DecorationSnapshot) => DecorationSnapshot;

// Keyed by the version being upgraded FROM. v0 -> v1 is a no-op structural
// change today; it exists to prove and exercise the chain.
const migrators: Record<number, Migrator> = {
  0: (input) => ({ ...input, version: 1 }),
  // v1 classified trophies and audio equipment as small decor. v2 gives each
  // a dedicated module, so retain a legacy assignment by moving it to that
  // module. Multiple legacy items of the same kind collapse to the first one
  // encountered because the new room has one slot per module.
  1: (input) => {
    const map = { ...input.map };

    for (const spotId of ["decor-1", "decor-2", "decor-3"]) {
      const ref = map[spotId];
      if (ref?.source !== "catalog") continue;

      const targetSpotId =
        ref.id === "trophy"
          ? "tall-module"
          : ref.id === "speaker" || ref.id === "boombox"
            ? "low-module"
            : undefined;
      if (!targetSpotId) continue;

      if (!(targetSpotId in map)) map[targetSpotId] = ref;
      delete map[spotId];
    }

    return { ...input, version: 2, map };
  },
};

/**
 * Upgrade a raw snapshot to CURRENT_VERSION by applying each migrator in order.
 * A snapshot already at (or ahead of) the current version is returned as-is —
 * a newer-than-us snapshot is left untouched rather than crashing, and
 * reconcile still validates it before render.
 */
export function migrate(input: DecorationSnapshot): DecorationSnapshot {
  let current = input;
  while (current.version < CURRENT_VERSION) {
    const migrator = migrators[current.version];
    if (!migrator) {
      throw new Error(`No studio snapshot migrator for version ${current.version}`);
    }
    const next = migrator(current);
    if (next.version <= current.version) {
      throw new Error(`Studio migrator for version ${current.version} did not advance the version`);
    }
    current = next;
  }
  return current;
}
