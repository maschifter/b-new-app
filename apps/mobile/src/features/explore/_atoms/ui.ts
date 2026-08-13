import type { ExploreRoom } from "@bnewapp/types";
import { atom } from "jotai";
import { exploreRoomsInfiniteAtom } from "./queries";

// The screen's flat item list: every loaded page's items in order. Derived from
// the infinite query cache — never copied into a second source of truth.
export const exploreRoomsAtom = atom(async (get): Promise<ExploreRoom[]> => {
  const query = await get(exploreRoomsInfiniteAtom);
  const pages = query.data.pages;
  return pages.flatMap((page) => page.items);
});
