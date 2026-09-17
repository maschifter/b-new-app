/**
 * The level filter's options. No endpoint enumerates levels, so the catalog's three
 * are hardcoded here — one place to revisit when a fourth is added, as
 * `plans/educational-app-level-filter.md` section 3 asks.
 */
export const FEED_LEVELS = [1, 2, 3] as const;

export function levelLabel(level: number | null): string {
  return level === null ? "All Levels" : `Level ${level}`;
}
