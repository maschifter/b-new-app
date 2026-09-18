import { getDanceGenres, getDanceMoves } from "@bnewapp/dance-flow/api";
import { type TestStore, renderWithProviders } from "@bnewapp/mobile-kit/testing";
import type { DanceGenre, DanceMove, DanceMovesPage } from "@bnewapp/types";
import { act, fireEventAsync, screen, waitFor } from "@testing-library/react-native";
import { Dimensions } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  activeMoveIndexAtom,
  feedPausedAtom,
  playbackRateAtom,
  proTipMoveIdAtom,
  selectLevelAtom,
  selectedGenreIdAtom,
  selectedLevelAtom,
} from "../../_atoms/ui";
import { FeedScreen } from "../feed-screen";

jest.mock("@bnewapp/dance-flow/api", () => ({
  getDanceGenres: jest.fn(),
  getDanceMoves: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (href: string) => mockPush(href) } }));

const mockUseIsFocused = jest.fn(() => true);
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => mockUseIsFocused() }));

interface MockPlayer {
  loop: boolean;
  muted: boolean;
  playbackRate: number;
  play: jest.Mock;
  pause: jest.Mock;
  addListener: jest.Mock;
}

const mockPlayers: Array<{ url: string; player: MockPlayer }> = [];
const mockStatusListeners: Array<(event: { status: string }) => void> = [];

jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (url: string, setup: (player: MockPlayer) => void) => {
    const player: MockPlayer = {
      loop: false,
      muted: false,
      playbackRate: 1,
      play: jest.fn(),
      pause: jest.fn(),
      addListener: jest.fn((_event: string, listener: (event: { status: string }) => void) => {
        mockStatusListeners.push(listener);
        return { remove: jest.fn() };
      }),
    };
    setup(player);
    mockPlayers.push({ url, player });
    return player;
  },
}));

const mockedGetGenres = getDanceGenres as jest.Mock;
const mockedGetMoves = getDanceMoves as jest.Mock;

const MOVE_ID = "00000000-0000-4000-8000-00000000000";

const HIDDEN = { includeHiddenElements: true } as const;

/** The mocked hook builds a player per render, so the live one is the newest. */
function latestPlayer(): MockPlayer {
  const entry = mockPlayers.at(-1);
  if (!entry) throw new Error("no player was created");
  return entry.player;
}

function move(id: string, overrides: Partial<DanceMove> = {}): DanceMove {
  return {
    id: `${MOVE_ID}${id}`,
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
    filmYourselfVideoUrl: `https://cdn.test/${id}-film-yourself.mp4`,
    genreIds: [],
    music: null,
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function page(items: DanceMove[], nextId: string | null): DanceMovesPage {
  return {
    items,
    nextCursor: nextId ? { id: nextId, sortOrder: 1, createdAt: "2026-01-01T00:00:00.000Z" } : null,
  };
}

function genre(id: string, name: string, sortOrder: number): DanceGenre {
  return { id, name, sortOrder };
}

const onOpenProfile = jest.fn();

async function mount(existing?: TestStore): Promise<TestStore> {
  const { store } = await renderWithProviders(
    <FeedScreen onOpenProfile={onOpenProfile} />,
    existing ? { store: existing } : { auth: { userId: "dancer", accessToken: "token" } },
  );
  return store;
}

/** Drives the pager's viewability callback the way a swipe would. */
async function swipeTo(index: number, moves: DanceMove[]) {
  const pairs = screen.getByTestId("feed-pager").props.viewabilityConfigCallbackPairs;
  await act(async () => {
    pairs[0].onViewableItemsChanged({
      viewableItems: [{ index, item: moves[index], key: moves[index]?.id, isViewable: true }],
      changed: [],
    });
  });
}

function lastRequest(): { genreId?: string | null; level?: number | null } {
  return mockedGetMoves.mock.calls.at(-1)?.[1] ?? {};
}

beforeEach(() => {
  mockUseIsFocused.mockReturnValue(true);
  mockPush.mockReset();
  onOpenProfile.mockReset();
  mockPlayers.length = 0;
  mockStatusListeners.length = 0;
  mockedGetGenres.mockReset();
  mockedGetMoves.mockReset();
  mockedGetGenres.mockResolvedValue([genre("hip-hop", "Hip Hop", 1)]);
  mockedGetMoves.mockResolvedValue(page([move("a")], null));
});

it("opens on All Levels and All Styles, and asks the server for neither", async () => {
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  expect(screen.getByLabelText("Level filter, All Levels")).toBeOnTheScreen();
  expect(screen.getByLabelText("Style filter, All Styles")).toBeOnTheScreen();
  expect(store.get(selectedLevelAtom)).toBeNull();
  expect(store.get(selectedGenreIdAtom)).toBeNull();
  expect(mockedGetMoves.mock.calls[0]?.[1]).toMatchObject({ genreId: null, level: null });
});

it("puts a chosen level and style on the same request and starts the new set at the top", async () => {
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");
  store.set(activeMoveIndexAtom, 3);

  mockedGetMoves.mockResolvedValue(page([move("filtered")], null));
  await fireEventAsync.press(screen.getByLabelText("Level filter, All Levels"));
  await fireEventAsync.press(screen.getByLabelText("Level 2"));
  await screen.findByLabelText("Dance this Move, Move filtered");

  await fireEventAsync.press(screen.getByLabelText("Style filter, All Styles"));
  await fireEventAsync.press(screen.getByLabelText("Hip Hop"));
  await waitFor(() => expect(lastRequest()).toMatchObject({ genreId: "hip-hop", level: 2 }));

  expect(store.get(activeMoveIndexAtom)).toBe(0);
  expect(store.get(playbackRateAtom)).toBe(1);
  expect(screen.getByLabelText("Level filter, Level 2")).toBeOnTheScreen();
  expect(screen.getByLabelText("Style filter, Hip Hop")).toBeOnTheScreen();
});

it("replaces the active level rather than adding a second one", async () => {
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  await fireEventAsync.press(screen.getByLabelText("Level filter, All Levels"));
  await fireEventAsync.press(screen.getByLabelText("Level 2"));
  await fireEventAsync.press(await screen.findByLabelText("Level filter, Level 2"));
  await fireEventAsync.press(screen.getByLabelText("Level 3"));

  await waitFor(() => expect(lastRequest()).toMatchObject({ level: 3 }));
  expect(store.get(selectedLevelAtom)).toBe(3);
});

it("lists the styles in the order the catalog returned them", async () => {
  mockedGetGenres.mockResolvedValue([
    genre("hip-hop", "Hip Hop", 1),
    genre("afro", "Afro", 2),
    genre("commercial", "Commercial", 3),
  ]);
  await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  await fireEventAsync.press(screen.getByLabelText("Style filter, All Styles"));

  expect(
    screen
      .getAllByTestId("feed-filter-option")
      .map((option) => option.props.accessibilityLabel as string),
  ).toEqual(["All Styles", "Hip Hop", "Afro", "Commercial"]);
});

it("offers No moves found and a Reset filters that re-requests everything", async () => {
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  mockedGetMoves.mockResolvedValue(page([], null));
  await fireEventAsync.press(screen.getByLabelText("Level filter, All Levels"));
  await fireEventAsync.press(screen.getByLabelText("Level 3"));
  expect(await screen.findByText("No moves found")).toBeOnTheScreen();

  mockedGetMoves.mockResolvedValue(page([move("a")], null));
  await fireEventAsync.press(screen.getByLabelText("Reset filters"));

  await screen.findByLabelText("Dance this Move, Move a");
  expect(store.get(selectedLevelAtom)).toBeNull();
  expect(store.get(selectedGenreIdAtom)).toBeNull();
  await waitFor(() => expect(lastRequest()).toMatchObject({ genreId: null, level: null }));
});

it("plays the preview chain's video, muted and looping", async () => {
  mockedGetMoves.mockResolvedValue(
    page([move("a", { mainVideoUrl: "https://cdn.test/main.mp4" }), move("b")], null),
  );
  await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  const urls = mockPlayers.map((entry) => entry.url);
  expect(urls).toContain("https://cdn.test/main.mp4");
  expect(urls).toContain("https://cdn.test/b-film-yourself.mp4");
  expect(mockPlayers[0]?.player.loop).toBe(true);
  expect(mockPlayers[0]?.player.muted).toBe(true);
});

it("still shows the title and the call to action for a move with no media at all", async () => {
  mockedGetMoves.mockResolvedValue(page([move("a", { filmYourselfVideoUrl: "" })], null));
  await mount();

  expect(await screen.findByText("Move a")).toBeOnTheScreen();
  expect(screen.getByLabelText("Dance this Move, Move a")).toBeOnTheScreen();
  expect(screen.queryByTestId("feed-move-video")).toBeNull();
});

it("offers Retry on a video that fails, and retrying keeps the filters", async () => {
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");
  await fireEventAsync.press(screen.getByLabelText("Level filter, All Levels"));
  await fireEventAsync.press(screen.getByLabelText("Level 2"));
  await screen.findByLabelText("Dance this Move, Move a");

  await act(async () => {
    for (const listener of [...mockStatusListeners]) listener({ status: "error" });
  });

  await fireEventAsync.press(await screen.findByLabelText("Retry Move a"));
  expect(store.get(selectedLevelAtom)).toBe(2);
  expect(await screen.findByTestId("feed-move-video")).toBeOnTheScreen();
});

it("hides Pro Tip for a move that has none and shows it when either tip field exists", async () => {
  const moves = [move("a"), move("b", { dancerTipImageUrl: "https://cdn.test/tip.jpg" })];
  mockedGetMoves.mockResolvedValue(page(moves, null));
  await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  expect(screen.queryByLabelText("Open Pro Tip")).toBeNull();

  await swipeTo(1, moves);
  expect(screen.getByLabelText("Open Pro Tip")).toBeOnTheScreen();
});

it("closes Pro Tip back onto the same position, filters and speed", async () => {
  const moves = [move("a", { dancerTipImageUrl: "https://cdn.test/tip.jpg" }), move("b")];
  mockedGetMoves.mockResolvedValue(page(moves, null));
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");
  store.set(selectedLevelAtom, 2);
  store.set(playbackRateAtom, 1.25);

  await fireEventAsync.press(screen.getByLabelText("Open Pro Tip"));
  expect(screen.getByTestId("feed-pro-tip")).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByLabelText("Close Pro Tip"));

  expect(screen.queryByTestId("feed-pro-tip")).toBeNull();
  expect(store.get(selectedLevelAtom)).toBe(2);
  expect(store.get(selectedGenreIdAtom)).toBeNull();
  expect(store.get(activeMoveIndexAtom)).toBe(0);
  expect(store.get(playbackRateAtom)).toBe(1.25);
  expect(store.get(proTipMoveIdAtom)).toBeNull();
});

it("returns to normal speed when the move changes", async () => {
  const moves = [move("a"), move("b")];
  mockedGetMoves.mockResolvedValue(page(moves, null));
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");
  store.set(playbackRateAtom, 1.5);

  await swipeTo(1, moves);

  expect(store.get(playbackRateAtom)).toBe(1);
  expect(store.get(activeMoveIndexAtom)).toBe(1);
  expect(screen.getByLabelText("Dance this Move, Move b")).toBeOnTheScreen();
});

it("keeps the filters reachable while the moves reload and after they fail", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    mockedGetMoves.mockRejectedValueOnce(new Error("offline"));
    await mount();

    expect(await screen.findByText("Couldn't load these moves")).toBeOnTheScreen();
    expect(screen.getByLabelText("Level filter, All Levels")).toBeOnTheScreen();
    expect(screen.getByLabelText("Style filter, All Styles")).toBeOnTheScreen();

    mockedGetMoves.mockResolvedValue(page([move("recovered")], null));
    await fireEventAsync.press(screen.getByLabelText("Retry"));
    expect(await screen.findByLabelText("Dance this Move, Move recovered")).toBeOnTheScreen();
  } finally {
    consoleError.mockRestore();
  }
});

it("retries a failed load with the current filters still applied", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    await mount();
    await screen.findByLabelText("Dance this Move, Move a");

    mockedGetMoves.mockRejectedValue(new Error("offline"));
    await fireEventAsync.press(screen.getByLabelText("Level filter, All Levels"));
    await fireEventAsync.press(screen.getByLabelText("Level 2"));
    await screen.findByText("Couldn't load these moves");

    mockedGetMoves.mockResolvedValue(page([move("filtered")], null));
    await fireEventAsync.press(screen.getByLabelText("Retry"));

    await screen.findByLabelText("Dance this Move, Move filtered");
    expect(lastRequest()).toMatchObject({ level: 2 });
    expect(screen.getByLabelText("Level filter, Level 2")).toBeOnTheScreen();
  } finally {
    consoleError.mockRestore();
  }
});

it("hands the focused move to the scan route and the profile to its route prop", async () => {
  const moves = [move("a"), move("b")];
  mockedGetMoves.mockResolvedValue(page(moves, null));
  await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  await swipeTo(1, moves);
  await fireEventAsync.press(screen.getByLabelText("Dance this Move, Move b"));
  expect(mockPush).toHaveBeenCalledWith(`/move/${moves[1]?.id}/scan`);

  await fireEventAsync.press(screen.getByLabelText("Open profile"));
  expect(onOpenProfile).toHaveBeenCalledTimes(1);
});

it("snaps the drag onto a tempo level, within the shared 0.5x to 1.5x bounds", async () => {
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  const barHeight = Math.round(Dimensions.get("window").height * 0.36);
  await act(async () => {
    fireGestureHandler(getByGestureTestId("tempo-bar-pan"), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0 },
      { translationY: -barHeight / 4 },
      { state: State.END, translationY: -barHeight / 4 },
    ]);
  });

  expect(store.get(playbackRateAtom)).toBeCloseTo(1.25, 5);

  await act(async () => {
    fireGestureHandler(getByGestureTestId("tempo-bar-pan"), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0 },
      { translationY: barHeight * 4 },
      { state: State.END, translationY: barHeight * 4 },
    ]);
  });

  expect(store.get(playbackRateAtom)).toBe(0.5);
});

// Whether the value appears *during* the drag is a device check: the jest helper
// always finalizes the gesture, so only the resting state is observable here.
it("keeps the tempo value off the screen outside an interaction", async () => {
  await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  expect(screen.queryByTestId("tempo-bar-value")).toBeNull();

  await act(async () => {
    fireGestureHandler(getByGestureTestId("tempo-bar-pan"), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0 },
      { translationY: -10 },
      { state: State.END, translationY: -10 },
    ]);
  });

  expect(screen.queryByTestId("tempo-bar-value")).toBeNull();
});

it("pages through the server cursor rather than the flattened list length", async () => {
  const requested: Array<string | undefined> = [];
  mockedGetMoves.mockImplementation((_token: string, options: { cursor?: { id: string } } = {}) => {
    requested.push(options.cursor?.id);
    return Promise.resolve(
      options.cursor ? page([move("b")], null) : page([move("a")], "cursor-a"),
    );
  });
  await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  await act(async () => {
    screen.getByTestId("feed-pager").props.onEndReached();
  });

  await waitFor(() => expect(requested).toEqual([undefined, "cursor-a"]));
});

// The relation resolves to a handler tag, and RNGH drops one it cannot resolve without
// reporting it. Asserting the tag is the only way to catch that here: the jest helper
// drives the pan in isolation, with no scroll gesture to lose to.
it("blocks the pager's own scroll gesture while the tempo bar is dragged", async () => {
  await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  const pan = getByGestureTestId("tempo-bar-pan");
  const pager = getByGestureTestId("feed-pager-native");

  expect(pager.handlerTag).toBeGreaterThan(0);
  await waitFor(() => expect(pan.config.blocksHandlers).toEqual([pager.handlerTag]));
});

it("keeps the filter bar reachable when the open Pro Tip's move is not in the feed", async () => {
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  await act(async () => {
    store.set(proTipMoveIdAtom, `${MOVE_ID}z`);
  });

  expect(screen.queryByTestId("feed-pro-tip")).toBeNull();
  expect(screen.getByLabelText("Level filter, All Levels")).toBeOnTheScreen();
  expect(store.get(proTipMoveIdAtom)).toBeNull();
});

it("brings the filter bar back when the pager fails while a Pro Tip is open", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    mockedGetMoves.mockResolvedValue(
      page([move("a", { dancerTipImageUrl: "https://cdn.test/tip.jpg" })], null),
    );
    const store = await mount();
    await screen.findByLabelText("Dance this Move, Move a");

    await fireEventAsync.press(screen.getByLabelText("Open Pro Tip"));
    expect(screen.queryByLabelText("Level filter, All Levels")).toBeNull();

    mockedGetMoves.mockRejectedValue(new Error("offline"));
    await act(async () => {
      store.set(selectLevelAtom, 2);
    });

    expect(await screen.findByText("Couldn't load these moves")).toBeOnTheScreen();
    expect(screen.getByLabelText("Level filter, Level 2")).toBeOnTheScreen();
    expect(store.get(proTipMoveIdAtom)).toBeNull();
  } finally {
    consoleError.mockRestore();
  }
});

it("rebuilds the pager at the top, not on the position the last one left", async () => {
  const moves = [move("a"), move("b")];
  mockedGetMoves.mockResolvedValue(page(moves, null));
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");
  await swipeTo(1, moves);
  await act(async () => {
    store.set(playbackRateAtom, 1.5);
    store.set(feedPausedAtom, true);
  });
  expect(screen.getByLabelText("Dance this Move, Move b")).toBeOnTheScreen();

  // The list underneath is rebuilt at offset 0 whatever took the old one away, so
  // the index has to come back with it — an error boundary's Retry, a re-suspend, or
  // a return to the tab all arrive here.
  await screen.unmountAsync();
  await mount(store);

  expect(await screen.findByLabelText("Dance this Move, Move a")).toBeOnTheScreen();
  expect(store.get(activeMoveIndexAtom)).toBe(0);
  expect(store.get(playbackRateAtom)).toBe(1);
  expect(store.get(feedPausedAtom)).toBe(false);
});

it("holds the call to action above the system bar the feed draws under", async () => {
  await renderWithProviders(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: 44, right: 0, bottom: 48, left: 0 },
      }}
    >
      <FeedScreen onOpenProfile={onOpenProfile} />
    </SafeAreaProvider>,
    { auth: { userId: "dancer", accessToken: "token" } },
  );
  await screen.findByLabelText("Dance this Move, Move a");

  // The gap alone leaves the button under a three-button navigation bar, which is
  // where the title and the label were on a device.
  expect(screen.getByTestId("feed-actions")).toHaveStyle({ paddingBottom: 48 + 16 });
});

it("holds the move on a tap and plays it again on the next one", async () => {
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");
  expect(latestPlayer().play).toHaveBeenCalled();

  await fireEventAsync.press(screen.getByLabelText("Pause Move a"));

  expect(store.get(feedPausedAtom)).toBe(true);
  expect(latestPlayer().pause).toHaveBeenCalled();
  expect(latestPlayer().play).not.toHaveBeenCalled();

  await fireEventAsync.press(screen.getByLabelText("Play Move a"));

  expect(store.get(feedPausedAtom)).toBe(false);
  expect(latestPlayer().play).toHaveBeenCalled();
});

it("offers the hold only on the move that is on the screen", async () => {
  const moves = [move("a"), move("b")];
  mockedGetMoves.mockResolvedValue(page(moves, null));
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");

  expect(screen.getAllByTestId("feed-playback-toggle")).toHaveLength(1);
  await fireEventAsync.press(screen.getByLabelText("Pause Move a"));

  await swipeTo(1, moves);

  expect(store.get(feedPausedAtom)).toBe(false);
  expect(screen.getByLabelText("Pause Move b")).toBeOnTheScreen();
});

it("clears a hold when the filters replace the feed", async () => {
  const store = await mount();
  await screen.findByLabelText("Dance this Move, Move a");
  await fireEventAsync.press(screen.getByLabelText("Pause Move a"));

  mockedGetMoves.mockResolvedValue(page([move("filtered")], null));
  await fireEventAsync.press(screen.getByLabelText("Level filter, All Levels"));
  await fireEventAsync.press(screen.getByLabelText("Level 2"));
  await screen.findByLabelText("Dance this Move, Move filtered");

  expect(store.get(feedPausedAtom)).toBe(false);
  expect(screen.getByLabelText("Pause Move filtered")).toBeOnTheScreen();
});

it("leaves nothing to hold on a move with no video", async () => {
  mockedGetMoves.mockResolvedValue(page([move("a", { filmYourselfVideoUrl: "" })], null));
  await mount();
  await screen.findByText("Move a");

  expect(screen.queryByTestId("feed-playback-toggle")).toBeNull();
});

it("falls back to the feed's own shape, with one set of filter chips", async () => {
  let deliver: (moves: DanceMovesPage) => void = () => {};
  mockedGetMoves.mockReturnValue(
    new Promise<DanceMovesPage>((resolve) => {
      deliver = resolve;
    }),
  );
  await mount();

  // The chips come from the real bar above the pager's boundary; the fallback under it
  // draws the pager's furniture only, so the two cannot stack.
  await screen.findByLabelText("Level filter, All Levels");
  expect(screen.getByTestId("feed-skeleton", HIDDEN)).toBeOnTheScreen();
  expect(screen.getAllByLabelText(/^Level filter/)).toHaveLength(1);

  await act(async () => {
    deliver(page([move("a")], null));
  });

  await screen.findByLabelText("Dance this Move, Move a");
  expect(screen.queryByTestId("feed-skeleton", HIDDEN)).toBeNull();
});
