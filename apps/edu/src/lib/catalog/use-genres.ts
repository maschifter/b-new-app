import type { DanceGenre } from "@bnewapp/types";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { cachedGenresAtom, genresQueryAtom, writeGenresCacheAtom } from "./genres";

export interface GenresState {
  /** The query's list once it has one, the persisted list until then. */
  genres: DanceGenre[];
  /** `true` while the list is still unknown, which is not the same as empty. */
  isPending: boolean;
  /** `true` once the fetch has failed. A cold cache alongside it means still unknown. */
  isError: boolean;
  /** Fetches again, for a screen that has no error boundary above it to retry from. */
  retry: () => void;
}

/**
 * The offline-first reader. A screen that spins until the network answers fails the
 * offline requirement, so the cache paints first and the query replaces it when it lands.
 */
export function useGenres(): GenresState {
  const query = useAtomValue(genresQueryAtom);
  const cached = useAtomValue(cachedGenresAtom);
  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  return {
    genres: query.data ?? cached,
    isPending: query.isPending,
    isError: query.isError,
    retry,
  };
}

/**
 * The write-through, mounted once by the root layout and nowhere else. A cache only the
 * profile filled would be empty in the case it exists for: a user who has only ever used
 * the feed opening the profile offline. It costs no extra fetch — the feed shares the key.
 */
export function useGenresCache(): void {
  const genres = useAtomValue(genresQueryAtom).data;
  const writeCache = useSetAtom(writeGenresCacheAtom);

  useEffect(() => {
    if (genres === undefined) return;
    writeCache(genres);
  }, [genres, writeCache]);
}
