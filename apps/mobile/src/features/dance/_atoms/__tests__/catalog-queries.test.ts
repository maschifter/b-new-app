import { getDanceMoves } from "@bnewapp/dance-flow/api";
import { createTestStore } from "@bnewapp/mobile-kit/testing";
import type { DanceMove, DanceMovesPage } from "@bnewapp/types";
import { waitFor } from "@testing-library/react-native";
import { danceMovesAtom, danceMovesInfiniteAtom } from "../queries";
import { selectedDanceGenreIdAtom } from "../ui";

jest.mock("@bnewapp/dance-flow/api", () => ({
  getDanceGenres: jest.fn(),
  getDanceMove: jest.fn(),
  getDanceMoves: jest.fn(),
  getDancePost: jest.fn(),
  getDancePosts: jest.fn(),
}));

const mockedGetDanceMoves = jest.mocked(getDanceMoves);

const AUTH = { userId: "dancer", accessToken: "token" };
const GENRE_ID = "00000000-0000-4000-8000-0000000000aa";

function move(id: string): DanceMove {
  return {
    id,
    title: `Move ${id}`,
    description: null,
    level: 1,
    bpm: null,
    thumbnailUrl: null,
    mainVideoUrl: null,
    proDancerVideoUrl: null,
    proDancerImageUrl: null,
    dancerTipVideoUrl: null,
    dancerTipImageUrl: null,
    presentationVideoUrl: null,
    filmYourselfVideoUrl: `https://cdn.test/${id}.mp4`,
    genreIds: [GENRE_ID],
    music: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function page(ids: string[], nextCursor: DanceMovesPage["nextCursor"] = null): DanceMovesPage {
  return { items: ids.map(move), nextCursor };
}

function catalogStore(genreId: string | null) {
  const { store } = createTestStore({ auth: AUTH });
  store.set(selectedDanceGenreIdAtom, genreId);
  const unsubscribe = store.sub(danceMovesInfiniteAtom, () => {});
  return { store, unsubscribe };
}

beforeEach(() => {
  mockedGetDanceMoves.mockReset();
});

it("requests the whole published catalog while no genre is selected", async () => {
  mockedGetDanceMoves.mockResolvedValue(page(["a"]));
  const { store, unsubscribe } = catalogStore(null);

  await expect(store.get(danceMovesAtom)).resolves.toEqual([move("a")]);
  expect(mockedGetDanceMoves).toHaveBeenCalledWith(AUTH.accessToken, {
    genreId: null,
    cursor: null,
    limit: 20,
  });
  unsubscribe();
});

it("refetches under a genre-scoped key when the selected genre changes", async () => {
  mockedGetDanceMoves.mockResolvedValue(page(["a"]));
  const { store, unsubscribe } = catalogStore(null);
  await store.get(danceMovesAtom);

  mockedGetDanceMoves.mockResolvedValue(page(["b"]));
  store.set(selectedDanceGenreIdAtom, GENRE_ID);

  await waitFor(async () => expect(await store.get(danceMovesAtom)).toEqual([move("b")]));
  expect(mockedGetDanceMoves).toHaveBeenLastCalledWith(AUTH.accessToken, {
    genreId: GENRE_ID,
    cursor: null,
    limit: 20,
  });
  unsubscribe();
});

it("flattens the cached pages in order and follows the server cursor", async () => {
  const cursor = { sortOrder: 0, createdAt: "2026-01-01T00:00:00.000Z", id: "a" };
  mockedGetDanceMoves.mockResolvedValueOnce(page(["a"], cursor));
  const { store, unsubscribe } = catalogStore(null);
  await store.get(danceMovesAtom);

  mockedGetDanceMoves.mockResolvedValueOnce(page(["b"]));
  const query = await store.get(danceMovesInfiniteAtom);
  await query.fetchNextPage();

  await waitFor(async () =>
    expect(await store.get(danceMovesAtom)).toEqual([move("a"), move("b")]),
  );
  expect(mockedGetDanceMoves).toHaveBeenLastCalledWith(AUTH.accessToken, {
    genreId: null,
    cursor,
    limit: 20,
  });
  unsubscribe();
});
