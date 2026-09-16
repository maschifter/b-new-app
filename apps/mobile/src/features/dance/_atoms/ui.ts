import { atom } from "jotai";

/** The optional genre filter; null represents the complete published catalog. */
export const selectedDanceGenreIdAtom = atom<string | null>(null);

/** The move the user opened from the catalog, if any. */
export const selectedDanceMoveIdAtom = atom<string | null>(null);

/** Learning-video playback rate, shared by the paged lesson videos. */
export const danceVideoRateAtom = atom(1);
