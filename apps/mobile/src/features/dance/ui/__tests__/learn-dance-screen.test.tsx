import type { DanceMove } from "@bnewapp/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEventAsync, renderAsync, screen, waitFor } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { Dimensions } from "react-native";

import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import { getDanceMove } from "../../api";
import { LearnDanceScreen } from "../learn-dance-screen";

jest.mock("../../api", () => ({ getDanceMove: jest.fn() }));
const mockUseIsFocused = jest.fn(() => true);
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => mockUseIsFocused() }));
const videoPlayers: Array<{ url: string; play: jest.Mock; pause: jest.Mock }> = [];

jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (
    url: string,
    setup: (player: {
      loop: boolean;
      muted: boolean;
      playbackRate: number;
      play: () => void;
      pause: () => void;
    }) => void,
  ) => {
    const player = {
      loop: false,
      muted: false,
      playbackRate: 1,
      play: jest.fn(),
      pause: jest.fn(),
    };
    videoPlayers.push({ url, ...player });
    setup(player);
    return player;
  },
}));

const mockedGetDanceMove = getDanceMove as jest.Mock;

function move(overrides: Partial<DanceMove> = {}): DanceMove {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Electric Slide",
    description: "Start with the groove.",
    level: 2,
    bpm: 118,
    thumbnailUrl: null,
    mainVideoUrl: "https://example.test/learn.mp4",
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
    ...overrides,
  };
}

async function mount() {
  const store = createStore();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  });
  store.set(queryClientAtom, queryClient);
  store.set(queryAuthAtom, { userId: "dancer", accessToken: "token" });
  return renderAsync(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <LearnDanceScreen moveId="00000000-0000-4000-8000-000000000001" />
      </Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedGetDanceMove.mockReset();
  mockUseIsFocused.mockReturnValue(true);
  videoPlayers.length = 0;
});

it("shows the returned lesson video and changes its selected speed", async () => {
  mockedGetDanceMove.mockResolvedValue(move());
  await mount();
  expect(await screen.findByText("Electric Slide")).toBeOnTheScreen();
  expect(screen.getByText("Learn")).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByLabelText("Set playback speed to 0.5x"));
  expect(screen.getByLabelText("Set playback speed to 0.5x")).toBeSelected();
});

it("uses the required recording reference when the primary lesson is absent", async () => {
  mockedGetDanceMove.mockResolvedValue(move({ mainVideoUrl: null }));
  await mount();
  expect(await screen.findByText("Learn")).toBeOnTheScreen();
});

it("plays only the visible lesson page", async () => {
  mockedGetDanceMove.mockResolvedValue(move({ proDancerVideoUrl: "https://example.test/pro.mp4" }));
  await mount();
  await screen.findByText("Electric Slide");

  const primaryPlayers = () => videoPlayers.filter((player) => player.url.endsWith("/learn.mp4"));
  const proPlayers = () => videoPlayers.filter((player) => player.url.endsWith("/pro.mp4"));
  expect(primaryPlayers().some((player) => player.play.mock.calls.length > 0)).toBe(true);
  expect(proPlayers().every((player) => player.pause.mock.calls.length > 0)).toBe(true);

  await act(async () => {
    screen.getByTestId("dance-lesson-videos").props.onMomentumScrollEnd({
      nativeEvent: { contentOffset: { x: Dimensions.get("window").width } },
    });
  });

  const proPlayer = () => proPlayers().at(-1);
  await waitFor(() => expect(proPlayer()?.play).toHaveBeenCalled());
});

it("keeps lesson playback paused when the screen is not focused", async () => {
  mockedGetDanceMove.mockResolvedValue(move());
  mockUseIsFocused.mockReturnValue(false);
  await mount();
  await screen.findByText("Electric Slide");
  const player = videoPlayers.at(-1);

  expect(player?.pause).toHaveBeenCalled();
});

it("recovers from an initial detail error", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    mockedGetDanceMove.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(move());
    await mount();
    await screen.findByText("Couldn't load this dance");
    await fireEventAsync.press(screen.getByLabelText("Retry loading dance"));
    expect(await screen.findByText("Electric Slide")).toBeOnTheScreen();
  } finally {
    consoleError.mockRestore();
  }
});
