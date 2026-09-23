import { renderWithProviders } from "@bnewapp/mobile-kit/testing";
import type { DanceMove } from "@bnewapp/types";
import { act, fireEventAsync, render, screen } from "@testing-library/react-native";
import { ProTipScreen, ProTipVideo } from "../pro-tip-screen";

const MOVE_ID = "00000000-0000-4000-8000-000000000001";

function move(overrides: Partial<DanceMove> = {}): DanceMove {
  return {
    id: MOVE_ID,
    title: "Move a",
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
    filmYourselfVideoUrl: "https://cdn.test/film-yourself.mp4",
    genreIds: [],
    music: null,
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Read per store, so a fresh render picks up whatever the test set. */
const mockMove = { current: move() };

jest.mock("@bnewapp/dance-flow/atoms", () => {
  const { atom } = require("jotai");
  const family = new Map();
  return {
    danceMoveDetailAtomFamily: (moveId: string) => {
      const cached = family.get(moveId);
      if (cached) return cached;
      const created = atom(() => ({ data: mockMove.current }));
      family.set(moveId, created);
      return created;
    },
  };
});

interface MockPlayer {
  status: string;
  loop: boolean;
  muted: boolean;
  playbackRate: number;
  play: jest.Mock;
  pause: jest.Mock;
  addListener: jest.Mock;
}

const mockInitialStatus = { current: "loading" };
const statusListeners: Array<(event: { status: string }) => void> = [];

jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (_url: string, setup: (player: MockPlayer) => void) => {
    const player: MockPlayer = {
      status: mockInitialStatus.current,
      loop: false,
      muted: false,
      playbackRate: 1,
      play: jest.fn(),
      pause: jest.fn(),
      addListener: jest.fn((_event: string, listener: (event: { status: string }) => void) => {
        statusListeners.push(listener);
        return { remove: jest.fn() };
      }),
    };
    setup(player);
    return player;
  },
}));

jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));

const onBack = jest.fn();

beforeEach(() => {
  statusListeners.length = 0;
  mockInitialStatus.current = "loading";
  mockMove.current = move();
  onBack.mockReset();
});

it("shows a spinner until the Pro Tip player can play", async () => {
  render(<ProTipVideo url="https://cdn.test/pro-tip.mp4" rate={1} />);

  expect(screen.getByTestId("feed-pro-tip-video-loading")).toBeOnTheScreen();

  await act(async () => {
    for (const listener of statusListeners) listener({ status: "readyToPlay" });
  });

  expect(screen.queryByTestId("feed-pro-tip-video-loading")).toBeNull();
});

it("clears the spinner for a clip already playable before the listener attaches", async () => {
  mockInitialStatus.current = "readyToPlay";

  render(<ProTipVideo url="https://cdn.test/pro-tip.mp4" rate={1} />);

  // No `statusChange` will ever arrive for this player, so the initial read is the
  // only thing that can take the spinner off a video that is already running.
  expect(screen.queryByTestId("feed-pro-tip-video-loading")).toBeNull();
});

it("offers the tempo control for a Pro Tip video", async () => {
  mockMove.current = move({ dancerTipVideoUrl: "https://cdn.test/tip.mp4" });

  await renderWithProviders(<ProTipScreen moveId={MOVE_ID} onBack={onBack} />, {
    auth: { userId: "dancer", accessToken: "token" },
  });

  expect(screen.getByTestId("feed-pro-tip-video")).toBeOnTheScreen();
  expect(screen.getByTestId("feed-pro-tip-tempo")).toBeOnTheScreen();
});

it("gives a still Pro Tip no tempo control it cannot honour", async () => {
  mockMove.current = move({ dancerTipImageUrl: "https://cdn.test/tip.jpg" });

  await renderWithProviders(<ProTipScreen moveId={MOVE_ID} onBack={onBack} />, {
    auth: { userId: "dancer", accessToken: "token" },
  });

  expect(screen.queryByTestId("feed-pro-tip-video")).toBeNull();
  expect(screen.queryByTestId("feed-pro-tip-tempo")).toBeNull();
});

it("stays closable for a move that has no Pro Tip at all", async () => {
  await renderWithProviders(<ProTipScreen moveId={MOVE_ID} onBack={onBack} />, {
    auth: { userId: "dancer", accessToken: "token" },
  });

  expect(screen.getByText("No Pro Tip is available for this move.")).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByLabelText("Close Pro Tip"));

  expect(onBack).toHaveBeenCalledTimes(1);
});
