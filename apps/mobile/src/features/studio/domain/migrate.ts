import type { DecorationSnapshot } from "./types";

// The snapshot carries a version number so structural upgrades (e.g. single
// room -> multiple rooms) can still read old data. Migration is explicit: on
// load, if version < CURRENT_VERSION, run an ordered migrator chain to upgrade
// the shape *before* rendering (design §6). The chain is wired now so future
// version bumps are a one-line addition, not a refactor.

export const CURRENT_VERSION = 1;

type Migrator = (input: DecorationSnapshot) => DecorationSnapshot;

// Keyed by the version being upgraded FROM. v0 -> v1 is a no-op structural
// change today; it exists to prove and exercise the chain.
const migrators: Record<number, Migrator> = {
  0: (input) => ({ ...input, version: 1 }),
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
