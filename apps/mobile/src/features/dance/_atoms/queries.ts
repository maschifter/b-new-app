import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import { queryErrorResetVersionAtom } from "@/lib/react-query/query-error-reset";
import type { DanceGenre, DanceMove, DanceMovesCursor, DanceMovesPage } from "@bnewapp/types";
import type { InfiniteData } from "@tanstack/react-query";
import { atom } from "jotai";
import { atomFamily } from "jotai-family";
import { atomWithSuspenseInfiniteQuery, atomWithSuspenseQuery } from "jotai-tanstack-query";
import { getDanceGenres, getDanceMove, getDanceMoves } from "../api";
import { selectedDanceGenreIdAtom } from "./ui";

const DANCE_MOVES_PAGE_LIMIT = 20;

export const danceGenresAtom = atomWithSuspenseQuery<DanceGenre[]>((get) => {
  const auth = get(queryAuthAtom);
  get(queryErrorResetVersionAtom);
  return {
    queryKey: ["dance-genres", auth?.userId ?? null],
    queryFn: async () => {
      if (!auth) throw new Error("Not authenticated");
      return getDanceGenres(auth.accessToken);
    },
  };
});

export const danceMovesInfiniteAtom = atomWithSuspenseInfiniteQuery<
  DanceMovesPage,
  Error,
  InfiniteData<DanceMovesPage>,
  (string | null)[],
  DanceMovesCursor | null
>((get) => {
  const auth = get(queryAuthAtom);
  const genreId = get(selectedDanceGenreIdAtom);
  get(queryErrorResetVersionAtom);
  return {
    queryKey: ["dance-moves", auth?.userId ?? null, genreId],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      if (!auth) throw new Error("Not authenticated");
      return getDanceMoves(auth.accessToken, {
        genreId,
        cursor: pageParam,
        limit: DANCE_MOVES_PAGE_LIMIT,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  };
});

/** Flattened cached pages for rendering; no parallel client-side source of truth. */
export const danceMovesAtom = atom(async (get): Promise<DanceMove[]> => {
  const query = await get(danceMovesInfiniteAtom);
  return query.data.pages.flatMap((page) => page.items);
});

export const danceMoveDetailAtomFamily = atomFamily((moveId: string) =>
  atomWithSuspenseQuery<DanceMove>((get) => {
    const auth = get(queryAuthAtom);
    get(queryErrorResetVersionAtom);
    return {
      queryKey: ["dance-move", auth?.userId ?? null, moveId],
      queryFn: async () => {
        if (!auth) throw new Error("Not authenticated");
        return getDanceMove(auth.accessToken, moveId);
      },
    };
  }),
);
