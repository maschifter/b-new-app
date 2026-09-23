import {
  createTestQueryClient,
  createTestStore,
  renderWithProviders,
} from "@bnewapp/mobile-kit/testing";
import type { DanceMove } from "@bnewapp/types";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEventAsync, screen, waitFor } from "@testing-library/react-native";
import * as Device from "expo-device";
import type { createStore } from "jotai";
import type { ComponentProps } from "react";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
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
jest.mock("expo-device", () => ({ isDevice: true }));
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
const device = Device as unknown as { isDevice: boolean };
const queryClients: QueryClient[] = [];
const mountedScreens: Array<{ unmountAsync: () => Promise<void> }> = [];

const MOVE_ID = "00000000-0000-4000-8000-000000000001";
const mockRecordingComplete = jest.fn();
const mockBack = jest.fn();

// A deliberately fast tempo: the countdown is `(60 / bpm) * 4` seconds, so this
// keeps the recording flow under a frame instead of the ~2s a real move takes.
const FAST_BPM = 12_000;

// Recording starts at `countdownSeconds(bpm) * 500` ms, so this leaves a 300 ms
// window inside the count-in to assert on.
const COUNT_IN_BPM = 400;

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

async function mount(
  danceMove: DanceMove = move(),
  configure?: (store: JotaiStore) => void,
  screenProps: Partial<ComponentProps<typeof RecordDanceScreen>> = {},
) {
  mockedGetDanceMove.mockResolvedValue(danceMove);
  mockedGetDanceMoves.mockResolvedValue({ items: [], nextCursor: null });
  const { store, queryClient } = createTestStore({
    queryClient: createTestQueryClient({ mutations: { gcTime: 0 } }),
    auth: { userId: "dancer", accessToken: "token" },
  });
  queryClients.push(queryClient);
  configure?.(store);

  const result = await renderWithProviders(
    <RecordDanceScreen
      moveId={MOVE_ID}
      onRecordingComplete={mockRecordingComplete}
      {...screenProps}
    />,
    { store },
  );
  mountedScreens.push(result);
  return result;
}

/** The guide is decorative, so it is hidden from assistive tech and from the default query. */
function silhouette() {
  return screen.queryByTestId("dance-silhouette", { includeHiddenElements: true });
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
  mockCameraPermission.canRequestPermission = true;
  mockBack.mockReset();
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
  device.isDevice = true;
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

it("shows a loading skeleton that matches the full-screen recording layout", async () => {
  mockedGetDanceMove.mockReturnValue(new Promise(() => {}));
  const { store, queryClient } = createTestStore({
    queryClient: createTestQueryClient({ mutations: { gcTime: 0 } }),
    auth: { userId: "dancer", accessToken: "token" },
  });
  queryClients.push(queryClient);

  const result = await renderWithProviders(
    <RecordDanceScreen moveId={MOVE_ID} onRecordingComplete={mockRecordingComplete} />,
    { store },
  );
  mountedScreens.push(result);

  expect(
    screen.getByTestId("record-dance-skeleton", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
  expect(screen.queryByTestId("dance-skeleton", { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByTestId("record-controls")).toBeNull();
});

it("renders the host app's pre-prompt copy in place of the shipped defaults", async () => {
  await mount(move(), undefined, {
    onBack: mockBack,
    cameraPermissionCopy: {
      title: "Allow camera access",
      body: "The camera is used to scan your movement and calculate your score.",
      allowLabel: "Allow Camera",
      dismissLabel: "Not now",
    },
  });

  expect(await screen.findByText("Allow camera access")).toBeOnTheScreen();
  expect(
    screen.getByText("The camera is used to scan your movement and calculate your score."),
  ).toBeOnTheScreen();
  expect(screen.getByText("Allow Camera")).toBeOnTheScreen();
  expect(screen.queryByText("Camera access is needed")).not.toBeOnTheScreen();
});

it("hides the secondary escape when the host screen passed no way back", async () => {
  await mount();

  expect(await screen.findByText("Camera access is needed")).toBeOnTheScreen();
  expect(screen.queryByLabelText("Not now")).toBeNull();
});

it("dismisses through onBack when the host screen passed one", async () => {
  await mount(move(), undefined, { onBack: mockBack });

  await fireEventAsync.press(await screen.findByLabelText("Not now"));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it("turns the denied state into a way out instead of a dead end", async () => {
  mockCameraPermission.canRequestPermission = false;
  const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);

  await mount(move(), undefined, { onBack: mockBack });

  await fireEventAsync.press(await screen.findByLabelText("Open Settings"));
  expect(openSettings).toHaveBeenCalledTimes(1);

  await fireEventAsync.press(screen.getByLabelText("Cancel"));
  expect(mockBack).toHaveBeenCalledTimes(1);
  openSettings.mockRestore();
});

it("keeps choreography audio playing while the camera session is active", async () => {
  mockCameraPermission.hasPermission = true;

  await mount();

  expect(screen.UNSAFE_getByType(Camera).props.allowBackgroundAudioPlayback).toBe(true);
  expect(screen.UNSAFE_getByType(Camera).props.device).toBe("front");
});

it("keeps the capture controls to the Boogiz-style action surface", async () => {
  mockCameraPermission.hasPermission = true;

  await mount(move(), undefined, { onBack: mockBack });

  expect(screen.queryByText("Electric Slide")).toBeNull();
  expect(screen.queryByText("Recording length: 60s")).toBeNull();
  expect(screen.queryByText(/DEV · Simulated/)).toBeNull();
  expect(screen.queryByLabelText("Discard take")).toBeNull();
  expect(screen.getByLabelText("Go back")).toBeOnTheScreen();
});

it("reads the physical orientation on a real device", async () => {
  mockCameraPermission.hasPermission = true;

  await mount();

  expect(screen.UNSAFE_getByType(Camera).props.orientationSource).toBe("device");
});

it("falls back to the interface orientation where there is no accelerometer", async () => {
  mockCameraPermission.hasPermission = true;
  device.isDevice = false;

  await mount();

  expect(screen.UNSAFE_getByType(Camera).props.orientationSource).toBe("interface");
});

it("keeps the inset video composited above the full-bleed one on Android", async () => {
  mockCameraPermission.hasPermission = true;

  await mount();

  // A SurfaceView sits below the window, so the inset would vanish under the full-bleed
  // camera surface. Only the overlaid surface pays for a TextureView.
  await waitFor(() =>
    expect(screen.getByTestId("reference-pip").props.surfaceType).toBe("textureView"),
  );
  expect(screen.UNSAFE_getByType(Camera).props.implementationMode).toBe("performance");

  await fireEventAsync.press(screen.getByLabelText("Swap reference and camera videos"));

  expect(screen.queryByTestId("reference-pip")).toBeNull();
  expect(screen.UNSAFE_getByType(Camera).props.implementationMode).toBe("compatible");
});

it("keeps the silhouette guide up through the count-in and drops it at the first frame", async () => {
  mockCameraPermission.hasPermission = true;
  const recorder = stoppableRecorder();
  mockCreateRecorder.mockResolvedValue(recorder);

  await mount(move({ bpm: COUNT_IN_BPM }));

  await waitFor(() => expect(silhouette()).not.toBeNull());

  await fireEventAsync.press(screen.getByLabelText("Start recording"));
  expect(silhouette()).not.toBeNull();

  await waitFor(() => expect(screen.getByLabelText("Stop recording")).toBeOnTheScreen());
  expect(silhouette()).toBeNull();

  await fireEventAsync.press(screen.getByLabelText("Stop recording"));
});

it("automatically stops and hands the clip to the next step when the take reaches its limit", async () => {
  mockCameraPermission.hasPermission = true;
  const recorder = stoppableRecorder();
  mockCreateRecorder.mockResolvedValue(recorder);

  await mount(move({ bpm: FAST_BPM }));
  jest.useFakeTimers();
  try {
    await fireEventAsync.press(screen.getByLabelText("Start recording"));
    await act(async () => {
      jest.advanceTimersByTime(20);
      await Promise.resolve();
    });

    expect(screen.getByLabelText("Stop recording")).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(60_500);
      await Promise.resolve();
    });

    expect(recorder.stopRecording).toHaveBeenCalledTimes(1);
    expect(mockRecordingComplete).toHaveBeenCalledWith(
      expect.objectContaining({ path: "file:///tmp/dance-attempt.mp4" }),
    );
  } finally {
    jest.useRealTimers();
  }
});

it("withholds the silhouette guide while the camera is still unauthorized", async () => {
  await mount();

  expect(await screen.findByText("Camera access is needed")).toBeOnTheScreen();
  expect(silhouette()).toBeNull();
});

/** The session's own error channel: no device on this phone, or another app holding it. */
function failTheCameraSession() {
  return fireEventAsync(
    screen.UNSAFE_getByType(Camera),
    "error",
    new Error("no camera device available"),
  );
}

it("explains a camera that will not start and keeps a way back to the caller", async () => {
  mockCameraPermission.hasPermission = true;

  await mount(move(), undefined, { onBack: mockBack });
  await screen.findByLabelText("Start recording");
  await failTheCameraSession();

  expect(screen.getByText("Camera unavailable")).toBeOnTheScreen();
  expect(screen.UNSAFE_queryByType(Camera)).toBeNull();
  expect(silhouette()).toBeNull();
  // Nothing to film, so the primary action stays shut rather than failing on press.
  expect(screen.getByLabelText("Start recording")).toBeDisabled();

  await fireEventAsync.press(screen.getByLabelText("Cancel"));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it("hides the escape from the unavailable state when the host screen passed no way back", async () => {
  mockCameraPermission.hasPermission = true;

  await mount();
  await screen.findByLabelText("Start recording");
  await failTheCameraSession();

  expect(screen.getByText("Camera unavailable")).toBeOnTheScreen();
  expect(screen.queryByLabelText("Cancel")).toBeNull();
});

it("builds a new camera session when the user retries", async () => {
  mockCameraPermission.hasPermission = true;

  await mount();
  await screen.findByLabelText("Start recording");
  await failTheCameraSession();

  await fireEventAsync.press(screen.getByLabelText("Try the camera again"));

  expect(screen.queryByText("Camera unavailable")).not.toBeOnTheScreen();
  expect(screen.UNSAFE_getByType(Camera)).toBeTruthy();
  expect(screen.getByLabelText("Start recording")).not.toBeDisabled();
});

it("tears the take down when the camera fails after the count-in has started", async () => {
  mockCameraPermission.hasPermission = true;
  const recorder = stoppableRecorder();
  mockCreateRecorder.mockResolvedValue(recorder);

  await mount(move({ bpm: COUNT_IN_BPM }));
  await fireEventAsync.press(await screen.findByLabelText("Start recording"));
  await failTheCameraSession();

  expect(screen.getByText("Camera unavailable")).toBeOnTheScreen();
  // Back at the start of the flow rather than mid-take: no countdown, no Stop.
  expect(screen.queryByLabelText("Stop recording")).toBeNull();
  expect(mockAudioPlayerPause).toHaveBeenCalled();
});

it("holds the recording controls above the system bar the camera draws under", async () => {
  mockCameraPermission.hasPermission = true;
  mockedGetDanceMove.mockResolvedValue(move());
  mockedGetDanceMoves.mockResolvedValue({ items: [], nextCursor: null });

  const result = await renderWithProviders(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: 44, right: 0, bottom: 48, left: 0 },
      }}
    >
      <RecordDanceScreen moveId={MOVE_ID} onRecordingComplete={mockRecordingComplete} />
    </SafeAreaProvider>,
    { auth: { userId: "dancer", accessToken: "token" } },
  );
  mountedScreens.push(result);

  await screen.findByLabelText("Start recording");
  expect(screen.getByTestId("record-controls")).toHaveStyle({ paddingBottom: 48 + 20 });
});

it("uses the back camera when the development toggle is enabled", async () => {
  mockCameraPermission.hasPermission = true;

  await mount(move(), (store) => {
    store.set(useBackDanceCameraAtom, true);
  });

  expect(screen.UNSAFE_getByType(Camera).props.device).toBe("back");
});

it("lets a dancer choose the production camera before the count-in", async () => {
  mockCameraPermission.hasPermission = true;

  await mount();

  await fireEventAsync.press(screen.getByLabelText("Flip camera"));

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
