import {
  getDanceGenres,
  getDanceMoves,
  getDancePost,
  getDancePosts,
} from "@bnewapp/dance-flow/api";
import { readQueryAuth, requireAuth } from "@bnewapp/mobile-kit";
import type {
  DanceGenre,
  DanceMove,
  DanceMovesCursor,
  DanceMovesPage,
  DancePostDetail,
  DancePostHistoryItem,
  DancePostsCursor,
  DancePostsPage,
} from "@bnewapp/types";
import type { InfiniteData } from "@tanstack/react-query";
import { atom } from "jotai";
import { atomFamily } from "jotai-family";
import {
  atomWithInfiniteQuery,
  atomWithSuspenseInfiniteQuery,
  atomWithSuspenseQuery,
} from "jotai-tanstack-query";
import { selectedDanceGenreIdAtom } from "./ui";

const DANCE_MOVES_PAGE_LIMIT = 20;
const DANCE_POSTS_PAGE_LIMIT = 18;

export const danceGenresAtom = atomWithSuspenseQuery<DanceGenre[]>((get) => {
  const auth = readQueryAuth(get);
  return {
    queryKey: ["dance-genres", auth?.userId ?? null],
    queryFn: async () => getDanceGenres(requireAuth(auth).accessToken),
  };
});

export const danceMovesInfiniteAtom = atomWithSuspenseInfiniteQuery<
  DanceMovesPage,
  Error,
  InfiniteData<DanceMovesPage>,
  (string | null)[],
  DanceMovesCursor | null
>((get) => {
  const auth = readQueryAuth(get);
  const genreId = get(selectedDanceGenreIdAtom);
  return {
    queryKey: ["dance-moves", auth?.userId ?? null, genreId],
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      getDanceMoves(requireAuth(auth).accessToken, {
        genreId,
        cursor: pageParam,
        limit: DANCE_MOVES_PAGE_LIMIT,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  };
});

/** Flattened cached pages for rendering; no parallel client-side source of truth. */
export const danceMovesAtom = atom(async (get): Promise<DanceMove[]> => {
  const query = await get(danceMovesInfiniteAtom);
  return query.data.pages.flatMap((page) => page.items);
});

export function dancePostsQueryKey(userId: string | null): (string | null)[] {
  return ["dance-posts", userId];
}

export function dancePostDetailQueryKey(userId: string | null, postId: string): (string | null)[] {
  return ["dance-post", userId, postId];
}

export const dancePostsInfiniteAtom = atomWithInfiniteQuery<
  DancePostsPage,
  Error,
  InfiniteData<DancePostsPage>,
  (string | null)[],
  DancePostsCursor | null
>((get) => {
  const auth = readQueryAuth(get, { errorBoundaryReset: false });
  return {
    queryKey: dancePostsQueryKey(auth?.userId ?? null),
    enabled: auth !== null,
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      getDancePosts(requireAuth(auth).accessToken, {
        cursor: pageParam,
        limit: DANCE_POSTS_PAGE_LIMIT,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  };
});

export const dancePostsAtom = atom((get): DancePostHistoryItem[] => {
  const query = get(dancePostsInfiniteAtom);
  return query.data?.pages.flatMap((page) => page.items) ?? [];
});

export const dancePostDetailAtomFamily = atomFamily((postId: string) =>
  atomWithSuspenseQuery<DancePostDetail>((get) => {
    const auth = readQueryAuth(get);
    return {
      queryKey: dancePostDetailQueryKey(auth?.userId ?? null, postId),
      queryFn: async () => getDancePost(requireAuth(auth).accessToken, postId),
    };
  }),
);
