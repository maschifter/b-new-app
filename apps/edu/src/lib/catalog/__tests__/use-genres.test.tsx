import { cachedGenresAtom, useGenres, useGenresCache, writeGenresCacheAtom } from "@/lib/catalog";
import { getDanceGenres } from "@bnewapp/dance-flow/api";
import { createTestStore, renderWithProviders } from "@bnewapp/mobile-kit/testing";
import type { DanceGenre } from "@bnewapp/types";
import { screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { MMKV } from "react-native-mmkv";
import { coerceGenres } from "../genres";

jest.mock("@bnewapp/dance-flow/api", () => ({ getDanceGenres: jest.fn() }));

const mockedGetGenres = getDanceGenres as jest.Mock;

const GENRES_KEY = "edu:v1:genres";
const AUTH = { userId: "dancer", accessToken: "token" };
const HIP_HOP: DanceGenre = { id: "hip-hop", name: "Hip Hop", sortOrder: 1 };
const AFRO: DanceGenre = { id: "afro", name: "Afro", sortOrder: 2 };

/** The root layout's writer, with nothing of the profile mounted beside it. */
function CacheWriterOnly() {
  useGenresCache();
  return null;
}

function GenreNames() {
  const { genres, isPending } = useGenres();
  return (
    <Text>{`${isPending ? "pending" : "settled"}:${genres.map((g) => g.name).join(",")}`}</Text>
  );
}

beforeEach(() => {
  mockedGetGenres.mockReset();
});

it("leaves the style names on disk for a session that only ever opened the feed", async () => {
  mockedGetGenres.mockResolvedValue([HIP_HOP, AFRO]);
  const { store } = createTestStore({ auth: AUTH });

  await renderWithProviders(<CacheWriterOnly />, { store });

  await waitFor(() => expect(store.get(cachedGenresAtom)).toEqual([HIP_HOP, AFRO]));
  expect(new MMKV({ id: "edu" }).getString(GENRES_KEY)).toBe(JSON.stringify([HIP_HOP, AFRO]));
});

it("does not rewrite the cache when a refetch returns the same list", async () => {
  const { store } = createTestStore({ auth: AUTH });
  store.set(writeGenresCacheAtom, [HIP_HOP]);
  const write = jest.spyOn(MMKV.prototype, "set");

  store.set(writeGenresCacheAtom, [{ ...HIP_HOP }]);

  expect(write).not.toHaveBeenCalled();
  write.mockRestore();
});

it("serves the cached list while the query is still in flight, and reports it as pending", async () => {
  mockedGetGenres.mockReturnValue(new Promise<DanceGenre[]>(() => {}));
  const { store } = createTestStore({ auth: AUTH });
  store.set(writeGenresCacheAtom, [HIP_HOP]);

  await renderWithProviders(<GenreNames />, { store });

  expect(screen.getByText("pending:Hip Hop")).toBeOnTheScreen();
});

it("replaces the cached list with the query's once it lands", async () => {
  mockedGetGenres.mockResolvedValue([HIP_HOP, AFRO]);
  const { store } = createTestStore({ auth: AUTH });
  store.set(writeGenresCacheAtom, [HIP_HOP]);

  await renderWithProviders(<GenreNames />, { store });

  expect(await screen.findByText("settled:Hip Hop,Afro")).toBeOnTheScreen();
});

it("drops a stored entry whose shape the payload no longer matches", () => {
  expect(
    coerceGenres([
      HIP_HOP,
      { id: "no-name", sortOrder: 2 },
      { id: "", name: "No id", sortOrder: 3 },
      { id: "no-order", name: "No order", sortOrder: "2" },
      null,
    ]),
  ).toEqual([HIP_HOP]);
  expect(coerceGenres({ id: "not-a-list" })).toEqual([]);
});
