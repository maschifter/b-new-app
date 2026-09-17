import { persistedEduAtom } from "@/lib/jotai/atom-with-mmkv";
import { getDanceGenres } from "@bnewapp/dance-flow/api";
import { readQueryAuth, requireAuth } from "@bnewapp/mobile-kit";
import type { DanceGenre } from "@bnewapp/types";
import { atom } from "jotai";
import { atomWithQuery, atomWithSuspenseQuery } from "jotai-tanstack-query";

/**
 * The style list, app-wide catalog data with two consumers that need opposite failure
 * behaviour: the feed renders it inside a Suspense + error-boundary pair, and the
 * profile has to render its sections offline, so it may neither suspend nor throw.
 *
 * Both atoms declare the same key and the same `queryFn`, so React Query holds one
 * cache entry and one in-flight fetch. `userId` stays at index 1, where
 * `AnonymousSessionProvider` scopes its cache cancellation.
 */

function genresQueryKey(userId: string | null) {
  return ["feed-genres", userId] as const;
}

export const genresAtom = atomWithSuspenseQuery<DanceGenre[]>((get) => {
  const auth = readQueryAuth(get);
  return {
    queryKey: genresQueryKey(auth?.userId ?? null),
    queryFn: async () => getDanceGenres(requireAuth(auth).accessToken),
  };
});

/** The non-suspense twin. A missing session disables the query rather than throwing. */
export const genresQueryAtom = atomWithQuery<DanceGenre[]>((get) => {
  const auth = readQueryAuth(get, { errorBoundaryReset: false });
  return {
    queryKey: genresQueryKey(auth?.userId ?? null),
    enabled: auth !== null,
    queryFn: async () => getDanceGenres(requireAuth(auth).accessToken),
  };
});

// Typed `unknown` and never read directly: the stored blob survives app upgrades and
// partial writes, so the exported read coerces it entry by entry.
const genresStorageAtom = persistedEduAtom<unknown>("genres", []);

function coerceGenre(value: unknown): DanceGenre | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { id, name, sortOrder } = value as Record<string, unknown>;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof name !== "string" || name.length === 0) return null;
  if (typeof sortOrder !== "number" || !Number.isFinite(sortOrder)) return null;
  return { id, name, sortOrder };
}

export function coerceGenres(value: unknown): DanceGenre[] {
  if (!Array.isArray(value)) return [];
  const genres: DanceGenre[] = [];
  for (const entry of value) {
    const genre = coerceGenre(entry);
    if (genre !== null) genres.push(genre);
  }
  return genres;
}

/** The last successful payload, so a cold offline launch still has its style names. */
export const cachedGenresAtom = atom<DanceGenre[]>((get) => coerceGenres(get(genresStorageAtom)));

export const writeGenresCacheAtom = atom(null, (get, set, genres: DanceGenre[]) => {
  if (sameGenres(get(cachedGenresAtom), genres)) return;
  set(genresStorageAtom, genres);
});

function sameGenres(current: DanceGenre[], next: DanceGenre[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((genre, index) => {
    const other = next[index];
    return (
      other !== undefined &&
      genre.id === other.id &&
      genre.name === other.name &&
      genre.sortOrder === other.sortOrder
    );
  });
}
