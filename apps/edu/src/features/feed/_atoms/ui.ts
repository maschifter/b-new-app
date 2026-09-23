import { atom } from "jotai";

/**
 * Feed UI state. Deliberately unpersisted: document 01 line 22 wants every cold
 * start on All Levels / All Styles, which MMKV would break.
 */

/** `null` = All Levels. */
export const selectedLevelAtom = atom<number | null>(null);

/** `null` = All Styles. */
export const selectedGenreIdAtom = atom<string | null>(null);

export const activeMoveIndexAtom = atom(0);

export const playbackRateAtom = atom(1);

/**
 * Tap-to-pause on the move that is on the screen. It belongs with the rate rather than
 * with the page: only the active page plays, and both are properties of the move the
 * user is watching, so both go back to their default whenever that move changes.
 */
export const feedPausedAtom = atom(false);

/**
 * A filter change replaces the whole result set, so the index into it has to go back
 * to 0 with the rate. Resetting only the rate strands the index past the end of a
 * shorter list, where no item is the active one and nothing plays at all.
 */
export const selectLevelAtom = atom(null, (_get, set, level: number | null) => {
  set(selectedLevelAtom, level);
  set(activeMoveIndexAtom, 0);
  set(playbackRateAtom, 1);
  set(feedPausedAtom, false);
});

export const selectGenreAtom = atom(null, (_get, set, genreId: string | null) => {
  set(selectedGenreIdAtom, genreId);
  set(activeMoveIndexAtom, 0);
  set(playbackRateAtom, 1);
  set(feedPausedAtom, false);
});

export const resetFeedFiltersAtom = atom(null, (_get, set) => {
  set(selectedLevelAtom, null);
  set(selectedGenreIdAtom, null);
  set(activeMoveIndexAtom, 0);
  set(playbackRateAtom, 1);
  set(feedPausedAtom, false);
});
