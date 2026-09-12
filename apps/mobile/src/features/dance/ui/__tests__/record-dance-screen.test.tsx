import type { DanceMove } from "@bnewapp/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEventAsync, renderAsync, screen, waitFor } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { Camera, useVideoOutput } from "react-native-vision-camera";

import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import { simulatedDanceRecordingEnabledAtom } from "../../_atoms/ui";
import {
  createDancePost,
  discardUploadingDancePost,
  getDanceMove,
  getDanceScoreStatus,
  markDancePostUploaded,
  uploadDanceVideo,
} from "../../api";
import { createSimulatedDanceRecorder } from "../../recording-adapter";
import { RecordDanceScreen } from "../record-dance-screen";

type JotaiStore = ReturnType<typeof createStore>;

const mockRequestPermission = jest.fn<Promise<boolean>, []>().mockResolvedValue(true);
const mockCreateRecorder = jest.fn();
const mockCameraPermission = {
  hasPermission: false,
  canRequestPermission: true,
  requestPermission: mockRequestPermission,
};

jest.mock("../../api", () => ({
  getDanceMove: jest.fn(),
  createDancePost: jest.fn(),
  discardUploadingDancePost: jest.fn(),
  uploadDanceVideo: jest.fn(),
  markDancePostUploaded: jest.fn(),
  getDanceScoreStatus: jest.fn(),
}));
jest.mock("../../recording-adapter", () => ({
  createSimulatedDanceRecorder: jest.fn(),
  preloadSimulatedDanceVideo: jest.fn().mockResolvedValue("file:///cache/reference.mp4"),
}));
jest.mock("expo-blur", () => ({ BlurView: "BlurView" }));
jest.mock("expo-audio", () => ({
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  useAudioPlayer: () => ({
    pause: jest.fn(),
    play: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: () => ({
    loop: false,
    muted: false,
    play: jest.fn(),
    pause: jest.fn(),
    addListener: () => ({ remove: jest.fn() }),
  }),
}));
jest.mock("react-native-vision-camera", () => ({
  Camera: "Camera",
  CommonResolutions: { HD_16_9: { width: 720, height: 1280 } },
  useCameraPermission: () => mockCameraPermission,
  useVideoOutput: jest.fn(() => ({ createRecorder: mockCreateRecorder })),
}));

const mockedGetDanceMove = getDanceMove as jest.Mock;
const mockedCreateDancePost = createDancePost as jest.Mock;
const mockedDiscardUploadingDancePost = discardUploadingDancePost as jest.Mock;
const mockedUploadDanceVideo = uploadDanceVideo as jest.Mock;
const mockedMarkDancePostUploaded = markDancePostUploaded as jest.Mock;
const mockedGetDanceScoreStatus = getDanceScoreStatus as jest.Mock;
const mockUseVideoOutput = useVideoOutput as jest.Mock;
const mockedCreateSimulatedRecorder = createSimulatedDanceRecorder as jest.Mock;

const MOVE_ID = "00000000-0000-4000-8000-000000000001";
const POST_ID = "00000000-0000-4000-8000-000000000010";

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
  const store = createStore();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  });
  store.set(queryClientAtom, queryClient);
  store.set(queryAuthAtom, { userId: "dancer", accessToken: "token" });
  configure?.(store);

  return renderAsync(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <RecordDanceScreen moveId={MOVE_ID} />
      </Provider>
    </QueryClientProvider>,
  );
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

function mockUploadSucceeds() {
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockResolvedValue(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue({ id: POST_ID, status: "uploaded" });
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
  mockedCreateDancePost.mockReset();
  mockedDiscardUploadingDancePost.mockReset();
  mockedUploadDanceVideo.mockReset();
  mockedMarkDancePostUploaded.mockReset();
  mockedGetDanceScoreStatus.mockReset();
  mockedCreateSimulatedRecorder.mockReset();
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

  expect(await screen.findByText("Couldn't record your dance. Please try again.")).toBeOnTheScreen();
  expect(screen.getByLabelText("Start recording")).toBeOnTheScreen();
});

it("uploads the recorded clip and reports the score once scanning completes", async () => {
  mockCameraPermission.hasPermission = true;
  mockUploadSucceeds();
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scored",
    hasScore: true,
    score: 96,
    isExternalScore: false,
    jobState: "completed",
  });

  await mount(move({ bpm: FAST_BPM }));
  await recordAClip();

  expect(await screen.findByText("You scored 96 points!")).toBeOnTheScreen();
  expect(mockedCreateDancePost).toHaveBeenCalledWith(
    "token",
    expect.objectContaining({ danceMoveId: MOVE_ID }),
  );
  expect(mockedUploadDanceVideo).toHaveBeenCalledWith(
    "https://storage.example.test/upload",
    "file:///tmp/dance-attempt.mp4",
  );
  expect(mockedMarkDancePostUploaded).toHaveBeenCalledWith("token", POST_ID);
});

it("surfaces a failed upload without queueing the post for scanning", async () => {
  mockCameraPermission.hasPermission = true;
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockRejectedValue(new Error("Unable to upload dance video"));

  await mount(move({ bpm: FAST_BPM }));
  await recordAClip();

  expect(
    await screen.findByText("Couldn't submit your dance. Please try again."),
  ).toBeOnTheScreen();
  expect(mockedMarkDancePostUploaded).not.toHaveBeenCalled();
  expect(mockedDiscardUploadingDancePost).toHaveBeenCalledWith("token", POST_ID);
  expect(mockedGetDanceScoreStatus).not.toHaveBeenCalled();
});

it("keeps polling after a single failed score check instead of giving up", async () => {
  mockCameraPermission.hasPermission = true;
  mockUploadSucceeds();
  mockedGetDanceScoreStatus.mockRejectedValue(new Error("network blip"));

  await mount(move({ bpm: FAST_BPM }));
  await recordAClip();

  await waitFor(() => expect(mockedGetDanceScoreStatus).toHaveBeenCalledTimes(1));
  expect(screen.getByText("Scoring your dance…")).toBeOnTheScreen();
  expect(screen.queryByText("Couldn't check your dance score.")).not.toBeOnTheScreen();
});

it("hands the clip to the upload flow when the user stops the recording early", async () => {
  mockCameraPermission.hasPermission = true;
  mockUploadSucceeds();
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scoring",
    hasScore: false,
    score: null,
    isExternalScore: false,
    jobState: "processing",
  });
  const recorder = stoppableRecorder();
  mockCreateRecorder.mockResolvedValue(recorder);

  await mount(move({ bpm: FAST_BPM }));
  await fireEventAsync.press(screen.getByLabelText("Start recording"));
  await waitFor(() => expect(screen.getByLabelText("Stop recording")).toBeOnTheScreen());
  await fireEventAsync.press(screen.getByLabelText("Stop recording"));

  expect(recorder.stopRecording).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("Scoring your dance…")).toBeOnTheScreen();
  expect(mockedUploadDanceVideo).toHaveBeenCalledWith(
    "https://storage.example.test/upload",
    "file:///tmp/dance-attempt.mp4",
  );
});

it("retries a failed upload with the clip already on disk instead of re-recording", async () => {
  mockCameraPermission.hasPermission = true;
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockRejectedValueOnce(new Error("Unable to upload dance video"));
  mockedUploadDanceVideo.mockResolvedValueOnce(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue({ id: POST_ID, status: "uploaded" });
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scored",
    hasScore: true,
    score: 88,
    isExternalScore: false,
    jobState: "completed",
  });

  await mount(move({ bpm: FAST_BPM }));
  await recordAClip();
  expect(
    await screen.findByText("Couldn't submit your dance. Please try again."),
  ).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByLabelText("Retry submitting your dance"));

  expect(await screen.findByText("You scored 88 points!")).toBeOnTheScreen();
  expect(mockCreateRecorder).toHaveBeenCalledTimes(1);
  expect(mockedUploadDanceVideo).toHaveBeenCalledTimes(2);
});

it("offers no retry for a scan that finished without a score", async () => {
  mockCameraPermission.hasPermission = true;
  mockUploadSucceeds();
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "failed",
    hasScore: false,
    score: null,
    isExternalScore: false,
    jobState: "failed",
  });

  await mount(move({ bpm: FAST_BPM }));
  await recordAClip();

  expect(
    await screen.findByText("Dance scoring failed. Please record another attempt."),
  ).toBeOnTheScreen();
  expect(screen.queryByLabelText("Retry submitting your dance")).not.toBeOnTheScreen();
});

it("records through the simulated adapter, and never the camera, when the dev switch is on", async () => {
  mockCameraPermission.hasPermission = false;
  mockUploadSucceeds();
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scoring",
    hasScore: false,
    score: null,
    isExternalScore: false,
    jobState: "processing",
  });
  const recorder = stoppableRecorder();
  mockedCreateSimulatedRecorder.mockResolvedValue(recorder);

  await mount(move({ bpm: FAST_BPM }), (store) => {
    store.set(simulatedDanceRecordingEnabledAtom, true);
  });

  // The dev switch stands in for the camera permission, so the prompt is gone.
  expect(screen.queryByText("Camera access is needed")).not.toBeOnTheScreen();
  expect(screen.getByText("DEV · Simulated recording adapter enabled")).toBeOnTheScreen();
  expect(screen.UNSAFE_queryByType(Camera)).toBeNull();

  await fireEventAsync.press(screen.getByLabelText("Start recording"));
  await waitFor(() => expect(screen.getByLabelText("Stop recording")).toBeOnTheScreen());
  await fireEventAsync.press(screen.getByLabelText("Stop recording"));

  expect(mockedCreateSimulatedRecorder).toHaveBeenCalledTimes(1);
  expect(mockCreateRecorder).not.toHaveBeenCalled();
  expect(await screen.findByText("Scoring your dance…")).toBeOnTheScreen();
});
