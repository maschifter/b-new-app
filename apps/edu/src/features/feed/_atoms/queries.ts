import { getDanceGenres, getDanceMoves } from "@bnewapp/dance-flow/api";
import { readQueryAuth, requireAuth } from "@bnewapp/mobile-kit";
import type { DanceGenre, DanceMove, DanceMovesCursor, DanceMovesPage } from "@bnewapp/types";
import type { InfiniteData } from "@tanstack/react-query";
import { atom } from "jotai";
import { atomWithSuspenseInfiniteQuery, atomWithSuspenseQuery } from "jotai-tanstack-query";
import { selectedGenreIdAtom, selectedLevelAtom } from "./ui";

const FEED_MOVES_PAGE_LIMIT = 20;

export const feedGenresAtom = atomWithSuspenseQuery<DanceGenre[]>((get) => {
  const auth = readQueryAuth(get);
  return {
    queryKey: ["feed-genres", auth?.userId ?? null],
    queryFn: async () => getDanceGenres(requireAuth(auth).accessToken),
  };
});

/**
 * Both filters live in the key, so changing one is a new cache entry rather than a
 * silent in-place mutation — document 01 line 43's "make any reload clear to the
 * user". `userId` stays at index 1: `AnonymousSessionProvider` scopes its cache
 * cancellation on exactly that position.
 */
export const feedMovesInfiniteAtom = atomWithSuspenseInfiniteQuery<
  DanceMovesPage,
  Error,
  InfiniteData<DanceMovesPage>,
  (string | number | null)[],
  DanceMovesCursor | null
>((get) => {
  const auth = readQueryAuth(get);
  const genreId = get(selectedGenreIdAtom);
  const level = get(selectedLevelAtom);
  return {
    queryKey: ["feed-moves", auth?.userId ?? null, genreId, level],
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      getDanceMoves(requireAuth(auth).accessToken, {
        genreId,
        level,
        cursor: pageParam,
        limit: FEED_MOVES_PAGE_LIMIT,
      }),
    // `listMoves` applies both filters in SQL before `limit + 1`, so an empty page
    // always carries a null cursor. No advance-until-non-empty loop is needed.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  };
});

/** Flattened cached pages for the pager; no second client-side source of truth. */
export const feedMovesAtom = atom(async (get): Promise<DanceMove[]> => {
  const query = await get(feedMovesInfiniteAtom);
  return query.data.pages.flatMap((page) => page.items);
});
