import {
  createTestQueryClient,
  createTestStore,
  renderWithProviders,
} from "@bnewapp/mobile-kit/testing";
import type { DanceMove } from "@bnewapp/types";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEventAsync, screen, waitFor } from "@testing-library/react-native";
import type { createStore } from "jotai";
import { Camera, useVideoOutput } from "react-native-vision-camera";

import { simulatedDanceRecordingEnabledAtom, useBackDanceCameraAtom } from "../../_atoms/ui";
import { getDanceMove, getDanceMoves } from "../../api";
import { configureDanceFlow } from "../../config";
import { createSimulatedDanceRecorder } from "../../recording-adapter";
import { RecordDanceScreen } from "../record-dance-screen";

type JotaiStore = ReturnType<typeof createStore>;

const mockRequestPermission = jest.fn<Promise<boolean>, []>().mockResolvedValue(true);
const mockCreateRecorder = jest.fn();
const mockAudioPlayerPause = jest.fn();
const mockVideoPlayerPause = jest.fn();
const mockUseIsFocused = jest.fn(() => true);
// Mutable so a test can put the player in the state the offset capture gates on.
const mockAudioPlayer = {
  currentTime: 0,
  isLoaded: false,
  playing: false,
  pause: mockAudioPlayerPause,
  play: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
};
const mockCameraPermission = {
  hasPermission: false,
  canRequestPermission: true,
  requestPermission: mockRequestPermission,
};

jest.mock("../../api", () => ({
  getDanceMove: jest.fn(),
  getDanceMoves: jest.fn(),
}));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => mockUseIsFocused() }));
jest.mock("../../recording-adapter", () => ({
  createSimulatedDanceRecorder: jest.fn(),
  preloadSimulatedDanceVideo: jest.fn().mockResolvedValue("file:///cache/reference.mp4"),
}));
jest.mock("expo-blur", () => ({ BlurView: "BlurView" }));
jest.mock("expo-audio", () => ({
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  useAudioPlayer: () => mockAudioPlayer,
}));
jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: () => ({
    loop: false,
    muted: false,
    play: jest.fn(),
    pause: mockVideoPlayerPause,
    addListener: () => ({ remove: jest.fn() }),
  }),
}));
jest.mock("react-native-vision-camera", () => ({
  Camera: "Camera",
  CommonResolutions: { HD_16_9: { width: 720, height: 1280 } },
  useCameraPermission: () => mockCameraPermission,
  useVideoOutput: jest.fn(() => ({ createRecorder: mockCreateRecorder })),
}));

configureDanceFlow({ apiUrl: "http://api.test", mmkvId: "dance-test" });

const mockedGetDanceMove = getDanceMove as jest.Mock;
const mockedGetDanceMoves = getDanceMoves as jest.Mock;
const mockUseVideoOutput = useVideoOutput as jest.Mock;
const mockedCreateSimulatedRecorder = createSimulatedDanceRecorder as jest.Mock;
const queryClients: QueryClient[] = [];
const mountedScreens: Array<{ unmountAsync: () => Promise<void> }> = [];

const MOVE_ID = "00000000-0000-4000-8000-000000000001";
const mockRecordingComplete = jest.fn();

// A deliberately fast tempo: the countdown is `(60 / bpm) * 4` seconds, so this
// keeps the recording flow under a frame instead of the ~2s a real move takes.
const FAST_BPM = 12_000;

function move(overrides: Partial<DanceMove> = {}): DanceMove {
  return {
    id: MOVE_ID,
    title: "Electric Slide",
    description: null,
    level: 2,
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
    music: {
      id: "music",
      title: "Track",
      artist: null,
      audioUrl: "https://example.test/track.mp3",
      delayBeforeAvatarDance: 0,
    },
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function mount(danceMove: DanceMove = move(), configure?: (store: JotaiStore) => void) {
  mockedGetDanceMove.mockResolvedValue(danceMove);
  mockedGetDanceMoves.mockResolvedValue({ items: [], nextCursor: null });
  const { store, queryClient } = createTestStore({
    queryClient: createTestQueryClient({ mutations: { gcTime: 0 } }),
    auth: { userId: "dancer", accessToken: "token" },
  });
  queryClients.push(queryClient);
  configure?.(store);

  const result = await renderWithProviders(
    <RecordDanceScreen moveId={MOVE_ID} onRecordingComplete={mockRecordingComplete} />,
    { store },
  );
  mountedScreens.push(result);
  return result;
}

/** A recorder that only finishes when the user presses Stop. */
function stoppableRecorder() {
  let recording = false;
  let onFinished: ((path: string) => void) | undefined;
  return {
    get isRecording() {
      return recording;
    },
    startRecording: jest.fn(async (finished: (path: string) => void) => {
      recording = true;
      onFinished = finished;
    }),
    stopRecording: jest.fn(async () => {
      recording = false;
      onFinished?.("/tmp/dance-attempt.mp4");
    }),
    cancelRecording: jest.fn(async () => {
      recording = false;
    }),
  };
}

/** Drives the flow up to the point where the recorder hands back a clip. */
async function recordAClip() {
  let finishRecording: ((path: string) => void) | undefined;
  let recording = false;
  mockCreateRecorder.mockResolvedValue({
    get isRecording() {
      return recording;
    },
    startRecording: jest.fn(async (onFinished: (path: string) => void) => {
      recording = true;
      finishRecording = onFinished;
    }),
    stopRecording: jest.fn(async () => {
      recording = false;
    }),
    cancelRecording: jest.fn(async () => {
      recording = false;
    }),
  });

  await fireEventAsync.press(screen.getByLabelText("Start recording"));
  await waitFor(() => expect(finishRecording).toBeDefined());
  await act(async () => {
    finishRecording?.("/tmp/dance-attempt.mp4");
  });
}

beforeEach(() => {
  mockCameraPermission.hasPermission = false;
  mockRequestPermission.mockClear();
  mockCreateRecorder.mockReset();
  mockUseVideoOutput.mockClear();
  mockUseIsFocused.mockReturnValue(true);
  mockAudioPlayerPause.mockReset();
  mockAudioPlayer.currentTime = 0;
  mockAudioPlayer.isLoaded = false;
  mockAudioPlayer.playing = false;
  mockVideoPlayerPause.mockReset();
  mockRecordingComplete.mockReset();
  mockedCreateSimulatedRecorder.mockReset();
});

afterEach(async () => {
  await act(async () => {
    await Promise.all(queryClients.map((queryClient) => queryClient.cancelQueries()));
  });
  for (const screenResult of mountedScreens.splice(0)) await screenResult.unmountAsync();
  for (const queryClient of queryClients.splice(0)) queryClient.clear();
});

it("uses the mocked camera permission flow and configures capture without audio", async () => {
  await mount();
  expect(await screen.findByText("Camera access is needed")).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByLabelText("Allow camera access"));
  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  expect(mockUseVideoOutput).toHaveBeenCalledWith(expect.objectContaining({ enableAudio: false }));
});

it("keeps choreography audio playing while the camera session is active", async () => {
  mockCameraPermission.hasPermission = true;

  await mount();

  expect(screen.UNSAFE_getByType(Camera).props.allowBackgroundAudioPlayback).toBe(true);
  expect(screen.UNSAFE_getByType(Camera).props.device).toBe("front");
});

it("uses the back camera when the development toggle is enabled", async () => {
  mockCameraPermission.hasPermission = true;

  await mount(move(), (store) => {
    store.set(useBackDanceCameraAtom, true);
  });

  expect(screen.UNSAFE_getByType(Camera).props.device).toBe("back");
});

it("shows a recoverable message when the recorder cannot start", async () => {
  mockCameraPermission.hasPermission = true;
  mockCreateRecorder.mockResolvedValue({
    get isRecording() {
      return false;
    },
    startRecording: jest.fn(async (_onFinished: (path: string) => void, onError: () => void) => {
      onError();
    }),
    stopRecording: jest.fn(),
    cancelRecording: jest.fn(),
  });

  await mount(move({ bpm: FAST_BPM }));
  await fireEventAsync.press(screen.getByLabelText("Start recording"));

  expect(
    await screen.findByText("Couldn't record your dance. Please try again."),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText("Start recording")).toBeOnTheScreen();
});

it("hands the normalized local clip to the result route when recording completes", async () => {
  mockCameraPermission.hasPermission = true;
  await mount(move({ bpm: FAST_BPM }));
  const audioPauseCalls = mockAudioPlayerPause.mock.calls.length;
  const videoPauseCalls = mockVideoPlayerPause.mock.calls.length;
  await recordAClip();

  expect(mockRecordingComplete).toHaveBeenCalledWith(
    expect.objectContaining({ path: "file:///tmp/dance-attempt.mp4" }),
  );
  expect(mockAudioPlayerPause.mock.calls.length).toBeGreaterThan(audioPauseCalls);
  expect(mockVideoPlayerPause.mock.calls.length).toBeGreaterThan(videoPauseCalls);
});

it("records through the simulated adapter, and never the camera, when the dev switch is on", async () => {
  mockCameraPermission.hasPermission = false;
  const recorder = stoppableRecorder();
  mockedCreateSimulatedRecorder.mockResolvedValue(recorder);

  await mount(move({ bpm: FAST_BPM }), (store) => {
    store.set(simulatedDanceRecordingEnabledAtom, true);
  });

  // The dev switch stands in for the camera permission, so the prompt is gone.
  expect(screen.queryByText("Camera access is needed")).not.toBeOnTheScreen();
  expect(screen.getByText("DEV · Simulated reference recording")).toBeOnTheScreen();
  expect(screen.UNSAFE_queryByType(Camera)).toBeNull();

  await fireEventAsync.press(screen.getByLabelText("Start recording"));
  await waitFor(() => expect(screen.getByLabelText("Stop recording")).toBeOnTheScreen());
  await fireEventAsync.press(screen.getByLabelText("Stop recording"));

  expect(mockedCreateSimulatedRecorder).toHaveBeenCalledTimes(1);
  expect(mockCreateRecorder).not.toHaveBeenCalled();
  expect(mockRecordingComplete).toHaveBeenCalledTimes(1);
});

it("hands over the music playhead measured at the first recorded frame", async () => {
  mockCameraPermission.hasPermission = true;
  mockAudioPlayer.isLoaded = true;
  mockAudioPlayer.playing = true;
  mockAudioPlayer.currentTime = 12.3456;

  await mount(move({ bpm: FAST_BPM }));
  await recordAClip();

  expect(mockRecordingComplete).toHaveBeenCalledWith(
    expect.objectContaining({ audioOffsetMs: 12_346 }),
  );
});

it("keeps a measured zero as a real offset rather than dropping it", async () => {
  mockCameraPermission.hasPermission = true;
  mockAudioPlayer.isLoaded = true;
  mockAudioPlayer.playing = true;
  mockAudioPlayer.currentTime = 0;

  await mount(move({ bpm: FAST_BPM }));
  await recordAClip();

  expect(mockRecordingComplete).toHaveBeenCalledWith(expect.objectContaining({ audioOffsetMs: 0 }));
});

// A 0 here would mux the track from its very start instead of reaching the server's
// computed fallback, so the field has to be absent, not zero.
it.each([
  ["the player never loaded", { isLoaded: false, playing: true }],
  ["the player loaded but never started", { isLoaded: true, playing: false }],
])("omits the offset entirely when %s", async (_label, state) => {
  mockCameraPermission.hasPermission = true;
  mockAudioPlayer.isLoaded = state.isLoaded;
  mockAudioPlayer.playing = state.playing;
  mockAudioPlayer.currentTime = 7.5;

  await mount(move({ bpm: FAST_BPM }));
  await recordAClip();

  expect(mockRecordingComplete.mock.calls[0]?.[0]).not.toHaveProperty("audioOffsetMs");
});
