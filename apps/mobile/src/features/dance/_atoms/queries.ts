import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import { queryErrorResetVersionAtom } from "@/lib/react-query/query-error-reset";
import { shouldFinishScorePolling } from "@bnewapp/dance-core";
import type {
  DanceGenre,
  DanceMove,
  DanceMovesCursor,
  DanceMovesPage,
  DancePostHistoryItem,
  DancePostsCursor,
  DancePostsPage,
  ScanStatus,
} from "@bnewapp/types";
import type { InfiniteData } from "@tanstack/react-query";
import { atom } from "jotai";
import { atomFamily } from "jotai-family";
import {
  atomWithInfiniteQuery,
  atomWithQuery,
  atomWithSuspenseInfiniteQuery,
  atomWithSuspenseQuery,
} from "jotai-tanstack-query";
import {
  getDanceGenres,
  getDanceMove,
  getDanceMoves,
  getDancePosts,
  getDanceScoreStatus,
} from "../api";
import { scorePollIntervalMs } from "../score-polling";
import { activeDanceScanAtom, selectedDanceGenreIdAtom } from "./ui";

const DANCE_MOVES_PAGE_LIMIT = 20;
const DANCE_POSTS_PAGE_LIMIT = 18;

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

export const dancePostsInfiniteAtom = atomWithInfiniteQuery<
  DancePostsPage,
  Error,
  InfiniteData<DancePostsPage>,
  (string | null)[],
  DancePostsCursor | null
>((get) => {
  const auth = get(queryAuthAtom);
  return {
    queryKey: ["dance-posts", auth?.userId ?? null],
    enabled: auth !== null,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      if (!auth) throw new Error("Not authenticated");
      return getDancePosts(auth.accessToken, { cursor: pageParam, limit: DANCE_POSTS_PAGE_LIMIT });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  };
});

export const dancePostsAtom = atom((get): DancePostHistoryItem[] => {
  const query = get(dancePostsInfiniteAtom);
  return query.data?.pages.flatMap((page) => page.items) ?? [];
});

export function danceScoreQueryKey(userId: string | null, postId: string | null) {
  return ["dance-score", userId, postId] as const;
}

/**
 * Polls one queued scan until it reaches a terminal state. The server guarantees
 * a fallback result, so this intentionally has no client-side deadline.
 */
export const danceScoreAtom = atomWithQuery<ScanStatus, Error>((get) => {
  const auth = get(queryAuthAtom);
  const scan = get(activeDanceScanAtom);
  return {
    queryKey: danceScoreQueryKey(auth?.userId ?? null, scan?.postId ?? null),
    enabled: auth !== null && scan !== null,
    gcTime: 0,
    queryFn: async () => {
      if (!auth || !scan) throw new Error("Not authenticated");
      return getDanceScoreStatus(auth.accessToken, scan.postId);
    },
    retry: true,
    retryDelay: (failureCount) => scorePollIntervalMs(failureCount + 1),
    refetchInterval: (query) => {
      const status = query.state.data;
      return status && shouldFinishScorePolling(status)
        ? false
        : scorePollIntervalMs(query.state.dataUpdateCount);
    },
  };
});
