import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import type { ExploreRoomsCursor, ExploreRoomsPage } from "@bnewapp/types";
import type { InfiniteData } from "@tanstack/react-query";
import { atomFamily } from "jotai-family";
import { atomWithInfiniteQuery, atomWithQuery } from "jotai-tanstack-query";
import { getExploreRoom, getExploreRooms } from "../api";

const EXPLORE_PAGE_LIMIT = 20;

type ExploreCursor = ExploreRoomsCursor | null;

// The Explore feed. The query key carries the authenticated `userId` so cache
// identity never leaks across accounts; queries stay disabled until the auth
// projection is present. The cursor is the raw server keyset boundary, so the
// next page param comes straight from `nextCursor`, never from item counts.
export const exploreRoomsInfiniteAtom = atomWithInfiniteQuery<
  ExploreRoomsPage,
  Error,
  InfiniteData<ExploreRoomsPage>,
  (string | null)[],
  ExploreCursor
>((get) => {
  const auth = get(queryAuthAtom);
  return {
    queryKey: ["explore-rooms", auth?.userId ?? null],
    enabled: auth !== null,
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
  atomWithQuery((get) => {
    const auth = get(queryAuthAtom);
    return {
      queryKey: ["explore-room", auth?.userId ?? null, ownerId],
      enabled: auth !== null,
      queryFn: async () => {
        if (!auth) throw new Error("Not authenticated");
        return getExploreRoom(auth.accessToken, ownerId);
      },
    };
  }),
);
