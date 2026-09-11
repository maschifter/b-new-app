import { atom } from "jotai";

/** The optional genre filter; null represents the complete published catalog. */
export const selectedDanceGenreIdAtom = atom<string | null>(null);

/** The card currently selected in the move carousel. */
export const selectedDanceMoveIdAtom = atom<string | null>(null);

/** Learning-video playback rate, shared by the paged lesson videos. */
export const danceVideoRateAtom = atom(1);
