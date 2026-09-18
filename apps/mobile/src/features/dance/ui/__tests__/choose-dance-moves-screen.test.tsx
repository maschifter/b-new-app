import { renderWithProviders } from "@bnewapp/mobile-kit/testing";
import type { DanceGenre, DanceMove, DanceMovesPage } from "@bnewapp/types";
import { act, fireEventAsync, screen, waitFor } from "@testing-library/react-native";

import { getDanceGenres, getDanceMoves } from "@bnewapp/dance-flow/api";
import { ChooseDanceMovesScreen } from "../choose-dance-moves-screen";

jest.mock("@bnewapp/dance-flow/api", () => ({
  getDanceGenres: jest.fn(),
  getDanceMove: jest.fn(),
  getDanceMoves: jest.fn(),
}));
const mockUseIsFocused = jest.fn(() => true);
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => mockUseIsFocused() }));

jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (
    _url: string,
    setup: (player: { loop: boolean; muted: boolean; play: () => void; pause: () => void }) => void,
  ) => {
    const player = { loop: false, muted: false, play: jest.fn(), pause: jest.fn() };
    setup(player);
    return player;
  },
}));

const mockedGetGenres = getDanceGenres as jest.Mock;
const mockedGetMoves = getDanceMoves as jest.Mock;

function move(id: string): DanceMove {
  return {
    id,
    title: `Move ${id}`,
    description: null,
    level: 1,
    bpm: 120,
    thumbnailUrl: null,
    mainVideoUrl: null,
    proDancerVideoUrl: null,
    proDancerImageUrl: null,
    dancerTipVideoUrl: null,
    dancerTipImageUrl: null,
    presentationVideoUrl: null,
    filmYourselfVideoUrl: "https://example.test/reference.mp4",
    genreIds: [],
    music: null,
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function page(items: DanceMove[], nextId: string | null): DanceMovesPage {
  return {
    items,
    nextCursor: nextId ? { id: nextId, sortOrder: 1, createdAt: "2026-01-01T00:00:00.000Z" } : null,
  };
}

function genre(id: string): DanceGenre {
  return { id, name: "Hip hop", sortOrder: 1 };
}

async function mount() {
  await renderWithProviders(<ChooseDanceMovesScreen onOpenMove={jest.fn()} />, {
    auth: { userId: "dancer", accessToken: "token" },
  });
}

beforeEach(() => {
  mockUseIsFocused.mockReturnValue(true);
  mockedGetGenres.mockReset();
  mockedGetMoves.mockReset();
  mockedGetGenres.mockResolvedValue([] satisfies DanceGenre[]);
});

it("shows a layout-matched skeleton while the initial catalog is loading", async () => {
  mockedGetGenres.mockReturnValue(new Promise(() => {}));
  mockedGetMoves.mockReturnValue(new Promise(() => {}));
  await mount();
  expect(screen.getByTestId("dance-skeleton", { includeHiddenElements: true })).toBeOnTheScreen();
});

it("shows an empty state when the selected catalog has no moves", async () => {
  mockedGetMoves.mockResolvedValue(page([], null));
  await mount();
  expect(await screen.findByText("No dances in this genre yet.")).toBeOnTheScreen();
});

it("renders returned moves and makes the first move ready to choose", async () => {
  mockedGetMoves.mockResolvedValue(page([move("a"), move("b")], null));
  await mount();
  expect(await screen.findByLabelText("Choose Move a")).toBeSelected();
  expect(screen.getByLabelText("Choose Move b")).toBeOnTheScreen();
  expect(screen.getByLabelText("Learn Move a")).toBeEnabled();
  expect(screen.getAllByTestId("dance-move-video-preview")).toHaveLength(2);
  expect(screen.getAllByTestId("dance-move-video-preview")[0]).toHaveProp("nativeControls", false);
});

it("shows a skeleton instead of the previous genre's moves while a new genre loads", async () => {
  let resolveFilteredMoves: ((value: DanceMovesPage) => void) | undefined;
  mockedGetGenres.mockResolvedValue([genre("hip-hop")]);
  mockedGetMoves.mockImplementation((_token: string, options: { genreId?: string | null } = {}) => {
    if (options.genreId === "hip-hop") {
      return new Promise<DanceMovesPage>((resolve) => {
        resolveFilteredMoves = resolve;
      });
    }
    return Promise.resolve(page([move("all")], null));
  });
  await mount();
  await screen.findByLabelText("Choose Move all");

  await fireEventAsync.press(screen.getByLabelText("Filter by Hip hop"));
  expect(screen.getByTestId("dance-skeleton", { includeHiddenElements: true })).toBeOnTheScreen();

  const resolve = resolveFilteredMoves;
  if (!resolve) throw new Error("Filtered request was not started");
  await act(async () => {
    resolve(page([move("hip-hop")], null));
  });
  expect(await screen.findByLabelText("Learn Move hip-hop")).toBeEnabled();
});

it("loads the next server-cursor page at the end of the carousel", async () => {
  const requested: string[] = [];
  mockedGetMoves.mockImplementation((_token: string, options: { cursor?: { id: string } } = {}) => {
    const key = options.cursor?.id ?? "start";
    requested.push(key);
    return Promise.resolve(key === "start" ? page([move("a")], "next") : page([move("b")], null));
  });
  await mount();
  await screen.findByLabelText("Choose Move a");

  act(() => {
    screen.getByTestId("dance-moves-list").props.onEndReached();
  });

  expect(await screen.findByLabelText("Choose Move b")).toBeOnTheScreen();
  await waitFor(() => expect(requested).toEqual(["start", "next"]));
});

it("selects the card snapped into view, matching the Boogiz carousel behavior", async () => {
  mockedGetMoves.mockResolvedValue(page([move("a"), move("b")], null));
  await mount();
  await screen.findByLabelText("Choose Move a");

  await act(async () => {
    screen.getByTestId("dance-moves-list").props.onMomentumScrollEnd({
      nativeEvent: { contentOffset: { x: 300, y: 0 } },
    });
  });

  expect(screen.getByLabelText("Choose Move b")).toBeSelected();
});

it("shuffles to a different selected card", async () => {
  const random = jest.spyOn(Math, "random").mockReturnValue(0);
  try {
    mockedGetMoves.mockResolvedValue(page([move("a"), move("b")], null));
    await mount();
    await screen.findByLabelText("Choose Move a");

    await fireEventAsync.press(screen.getByLabelText("Shuffle dance moves"));
    expect(screen.getByLabelText("Choose Move b")).toBeSelected();
  } finally {
    random.mockRestore();
  }
});

it("refreshes from the explicit control on the horizontal carousel", async () => {
  mockedGetMoves.mockResolvedValue(page([move("a")], null));
  await mount();
  await screen.findByLabelText("Choose Move a");

  await fireEventAsync.press(screen.getByLabelText("Refresh dance moves"));
  await waitFor(() => expect(mockedGetMoves).toHaveBeenCalledTimes(2));
});

it("recovers from an initial loading error", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    mockedGetMoves
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page([move("recovered")], null));
    await mount();
    await screen.findByText("Couldn't load dances");
    await fireEventAsync.press(screen.getByLabelText("Retry loading dances"));
    expect(await screen.findByLabelText("Choose Move recovered")).toBeOnTheScreen();
  } finally {
    consoleError.mockRestore();
  }
});
