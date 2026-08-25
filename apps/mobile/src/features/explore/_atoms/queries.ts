import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import { queryErrorResetVersionAtom } from "@/lib/react-query/query-error-reset";
import type { ExploreRoomsCursor, ExploreRoomsPage } from "@bnewapp/types";
import type { InfiniteData } from "@tanstack/react-query";
import { atomFamily } from "jotai-family";
import {
  atomWithSuspenseInfiniteQuery,
  atomWithSuspenseQuery,
} from "jotai-tanstack-query";
import { getExploreRooms, visitExploreRoom } from "../api";

const EXPLORE_PAGE_LIMIT = 20;

type ExploreCursor = ExploreRoomsCursor | null;

// The Explore feed. The protected route mounts only after the auth projection
// is present, and the query key carries `userId` so cache identity never leaks
// across accounts. The cursor is the raw server keyset boundary, so the next
// page param comes straight from `nextCursor`, never from item counts.
export const exploreRoomsInfiniteAtom = atomWithSuspenseInfiniteQuery<
  ExploreRoomsPage,
  Error,
  InfiniteData<ExploreRoomsPage>,
  (string | null)[],
  ExploreCursor
>((get) => {
  const auth = get(queryAuthAtom);
  get(queryErrorResetVersionAtom);
  return {
    queryKey: ["explore-rooms", auth?.userId ?? null],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      if (!auth) throw new Error("Not authenticated");
      return getExploreRooms(auth.accessToken, { limit: EXPLORE_PAGE_LIMIT, cursor: pageParam });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  };
});

// A single visited room. Server state like the feed: same auth-scoped query-atom
// standard, one atom per owner. Detail data is cached per authenticated viewer.
export const exploreRoomQueryAtomFamily = atomFamily((ownerId: string) =>
  atomWithSuspenseQuery((get) => {
    const auth = get(queryAuthAtom);
    get(queryErrorResetVersionAtom);
    return {
      queryKey: ["explore-room", auth?.userId ?? null, ownerId],
      queryFn: async () => {
        if (!auth) throw new Error("Not authenticated");
        return visitExploreRoom(auth.accessToken, ownerId);
      },
      // This request appends a visit. Retrying after an ambiguous network error
      // could store the same screen opening more than once.
      retry: false,
    };
  }),
);
