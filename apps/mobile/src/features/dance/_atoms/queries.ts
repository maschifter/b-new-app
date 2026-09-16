import { readQueryAuth, requireAuth } from "@/lib/jotai/authed-query";
import { shouldFinishScorePolling } from "@bnewapp/dance-core";
import type {
  DanceGenre,
  DanceMove,
  DanceMovesCursor,
  DanceMovesPage,
  DancePostDetail,
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
  getDancePost,
  getDancePosts,
  getDanceScoreStatus,
} from "../api";
import { scorePollIntervalMs } from "../score-polling";
import { activeDanceScanAtom, selectedDanceGenreIdAtom } from "./ui";

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

export const danceMoveDetailAtomFamily = atomFamily((moveId: string) =>
  atomWithSuspenseQuery<DanceMove>((get) => {
    const auth = readQueryAuth(get);
    return {
      queryKey: ["dance-move", auth?.userId ?? null, moveId],
      queryFn: async () => getDanceMove(requireAuth(auth).accessToken, moveId),
    };
  }),
);

/**
 * Non-suspense twin of `danceMoveDetailAtomFamily`, sharing its query key so the Record
 * screen's cached move is reused rather than refetched. The Result screen reads the move
 * only for its music: suspending there would hold the upload behind a fetch the dance
 * does not need, and a failed fetch must cost the music, not the screen.
 */
export const optionalDanceMoveAtomFamily = atomFamily((moveId: string) =>
  atomWithQuery<DanceMove>((get) => {
    const auth = readQueryAuth(get, { errorBoundaryReset: false });
    return {
      queryKey: ["dance-move", auth?.userId ?? null, moveId],
      enabled: auth !== null,
      queryFn: async () => getDanceMove(requireAuth(auth).accessToken, moveId),
    };
  }),
);

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

export function danceScoreQueryKey(userId: string | null, postId: string | null) {
  return ["dance-score", userId, postId] as const;
}

/**
 * Polls one queued scan until it reaches a terminal state. The server guarantees
 * a fallback result, so this intentionally has no client-side deadline.
 */
export const danceScoreAtom = atomWithQuery<ScanStatus, Error>((get) => {
  const auth = readQueryAuth(get, { errorBoundaryReset: false });
  const scan = get(activeDanceScanAtom);
  return {
    queryKey: danceScoreQueryKey(auth?.userId ?? null, scan?.postId ?? null),
    enabled: auth !== null && scan !== null,
    gcTime: 0,
    queryFn: async () => {
      if (!scan) throw new Error("No active dance scan");
      return getDanceScoreStatus(requireAuth(auth).accessToken, scan.postId);
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
