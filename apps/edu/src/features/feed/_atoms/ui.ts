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

/** `null` = the Pro Tip overlay is closed. */
export const proTipMoveIdAtom = atom<string | null>(null);

export const MIN_PLAYBACK_RATE = 0.5;
export const MAX_PLAYBACK_RATE = 1.5;

/**
 * A filter change replaces the whole result set, so the index into it has to go back
 * to 0 with the rate. Resetting only the rate strands the index past the end of a
 * shorter list, where no item is the active one and nothing plays at all.
 */
export const selectLevelAtom = atom(null, (_get, set, level: number | null) => {
  set(selectedLevelAtom, level);
  set(activeMoveIndexAtom, 0);
  set(playbackRateAtom, 1);
});

export const selectGenreAtom = atom(null, (_get, set, genreId: string | null) => {
  set(selectedGenreIdAtom, genreId);
  set(activeMoveIndexAtom, 0);
  set(playbackRateAtom, 1);
});

export const resetFeedFiltersAtom = atom(null, (_get, set) => {
  set(selectedLevelAtom, null);
  set(selectedGenreIdAtom, null);
  set(activeMoveIndexAtom, 0);
  set(playbackRateAtom, 1);
});
