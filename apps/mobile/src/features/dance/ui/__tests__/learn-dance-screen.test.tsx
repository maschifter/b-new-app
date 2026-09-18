import { renderWithProviders } from "@bnewapp/mobile-kit/testing";
import type { DanceMove } from "@bnewapp/types";
import { act, fireEvent, fireEventAsync, screen, waitFor } from "@testing-library/react-native";
import { Dimensions, StyleSheet } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { getDanceMove } from "@bnewapp/dance-flow/api";
import { LearnDanceScreen } from "../learn-dance-screen";

jest.mock("@bnewapp/dance-flow/api", () => ({ getDanceMove: jest.fn() }));
const mockUseIsFocused = jest.fn(() => true);
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => mockUseIsFocused() }));
const videoPlayers: Array<{
  url: string;
  playbackRate: number;
  play: jest.Mock;
  pause: jest.Mock;
}> = [];

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
    // The player object itself, not a copy: `playbackRate` is written after creation
    // and a snapshot would never show the tempo bar's effect.
    videoPlayers.push(Object.assign(player, { url }));
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
  return renderWithProviders(<LearnDanceScreen moveId="00000000-0000-4000-8000-000000000001" />, {
    auth: { userId: "dancer", accessToken: "token" },
  });
}

const STAGE_HEIGHT = 600;

/** The bar only renders once the video area reports a height, which jest never does. */
async function layoutStage() {
  await act(async () => {
    fireEvent(screen.getByTestId("dance-lesson-stage"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: STAGE_HEIGHT } },
    });
  });
}

function tempoBarHeight(): number {
  return Math.round(STAGE_HEIGHT * 0.45);
}

/** Drags by `translationY` pixels; negative is upwards, which speeds the video up. */
async function dragTempo(translationY: number) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId("tempo-bar-pan"), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0 },
      { translationY },
      { state: State.END, translationY },
    ]);
  });
}

beforeEach(() => {
  mockedGetDanceMove.mockReset();
  mockUseIsFocused.mockReturnValue(true);
  videoPlayers.length = 0;
});

it("shows the returned lesson video", async () => {
  mockedGetDanceMove.mockResolvedValue(move());
  await mount();
  expect(await screen.findByText("Electric Slide")).toBeOnTheScreen();
  expect(screen.getByText("Learn")).toBeOnTheScreen();
});

it("snaps a tempo drag onto a level and plays the lesson at it", async () => {
  mockedGetDanceMove.mockResolvedValue(move());
  await mount();
  await screen.findByText("Electric Slide");
  await layoutStage();

  // A quarter of the bar is a quarter of the 0.5x-to-1.5x span: one level up.
  await dragTempo(-tempoBarHeight() / 4);
  expect(screen.getByTestId("tempo-bar-value")).toHaveTextContent("1.25×");
  await waitFor(() => expect(videoPlayers.at(-1)?.playbackRate).toBe(1.25));

  // Well short of the next level's halfway point, so the level holds.
  await dragTempo(-tempoBarHeight() * 0.05);
  expect(screen.getByTestId("tempo-bar-value")).toHaveTextContent("1.25×");
});

it("steps the tempo one level at a time for assistive technology", async () => {
  mockedGetDanceMove.mockResolvedValue(move());
  await mount();
  await screen.findByText("Electric Slide");
  await layoutStage();

  const bar = screen.getByLabelText("Playback speed");
  expect(bar.props.accessibilityValue).toEqual({ text: "1 times normal speed" });

  await act(async () => {
    fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
  });
  expect(screen.getByTestId("tempo-bar-value")).toHaveTextContent("0.75×");
  await waitFor(() => expect(videoPlayers.at(-1)?.playbackRate).toBe(0.75));
});

it("keeps the tempo bar off the screen until the stage has been measured", async () => {
  mockedGetDanceMove.mockResolvedValue(move());
  await mount();
  await screen.findByText("Electric Slide");

  expect(screen.queryByTestId("tempo-bar")).toBeNull();
  await layoutStage();
  expect(screen.getByTestId("tempo-bar")).toBeOnTheScreen();
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

// The player keeps its native controls, so the bar cannot sit over it: the cluster under
// the bar's pan area would be unreachable while the controls overlay is up.
it("keeps the player's native controls and lays the bar in a column beside it", async () => {
  mockedGetDanceMove.mockResolvedValue(move());
  await mount();
  await screen.findByText("Electric Slide");
  await layoutStage();

  expect(screen.getByTestId("dance-lesson-video").props.nativeControls).toBe(true);
  // Nothing measures layout here, so the guarantee is the declared one: the column the
  // page gives up is the column the bar is laid into.
  const page = StyleSheet.flatten(screen.getByTestId("dance-lesson-page").props.style);
  const gutter = StyleSheet.flatten(screen.getByTestId("dance-tempo-gutter").props.style);
  expect(page.paddingRight).toBe(gutter.width);
  expect(page.paddingRight).toBeGreaterThan(0);
});

// The bar lies on top of the pager, so a sideways swipe that starts on it still has to
// reach the list underneath. The relation resolves to a handler tag, and RNGH drops one it
// cannot resolve without reporting it; asserting the tag is the only way to catch that here,
// since the jest helper drives the pan in isolation with no scroll gesture to lose to.
it("leaves the lesson pager free to page around the tempo bar", async () => {
  mockedGetDanceMove.mockResolvedValue(move({ proDancerVideoUrl: "https://example.test/pro.mp4" }));
  await mount();
  await screen.findByText("Electric Slide");
  await layoutStage();

  const pan = getByGestureTestId("tempo-bar-pan");
  const pager = getByGestureTestId("dance-lesson-pager");

  expect(pager.handlerTag).toBeGreaterThan(0);
  await waitFor(() => expect(pan.config.blocksHandlers).toEqual([pager.handlerTag]));
  expect(pan.config.failOffsetXEnd).toBeGreaterThan(0);
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
