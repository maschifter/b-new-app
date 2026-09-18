import { mergeAudioOffsetMs } from "@bnewapp/dance-core";
import { createTestQueryClient, renderWithProviders } from "@bnewapp/mobile-kit/testing";
import { fireEventAsync, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  createDancePost,
  discardUploadingDancePost,
  getDanceMove,
  getDanceScoreStatus,
  markDancePostUploaded,
  uploadDanceVideo,
} from "../../api";
import { DanceResultScreen } from "../dance-result-screen";

const MOVE_ID = "00000000-0000-4000-8000-000000000001";
const POST_ID = "00000000-0000-4000-8000-000000000010";
const onRecordAgain = jest.fn();
const onDone = jest.fn();
const MUSIC_URL = "https://cdn.test/track.mp3";
const MOVE_BPM = 120;
const DELAY_BEFORE_AVATAR_DANCE = 8_000;
const mockUseIsFocused = jest.fn(() => true);
const mockUseSyncedMusicTrack = jest.fn();

jest.mock("../../api", () => ({
  createDancePost: jest.fn(),
  discardUploadingDancePost: jest.fn(),
  getDanceMove: jest.fn(),
  getDanceScoreStatus: jest.fn(),
  markDancePostUploaded: jest.fn(),
  uploadDanceVideo: jest.fn(),
}));
jest.mock("@bnewapp/mobile-kit/media/use-synced-music-track", () => ({
  useSyncedMusicTrack: (player: unknown, options: unknown) =>
    mockUseSyncedMusicTrack(player, options),
}));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => mockUseIsFocused() }));
jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (
    _source: string,
    configure: (player: {
      loop: boolean;
      muted: boolean;
      play: () => void;
      pause: () => void;
    }) => void,
  ) => {
    const player = { loop: false, muted: false, play: jest.fn(), pause: jest.fn() };
    configure(player);
    return player;
  },
}));

const mockedCreateDancePost = createDancePost as jest.Mock;
const mockedGetDanceMove = getDanceMove as jest.Mock;
const mockedDiscardUploadingDancePost = discardUploadingDancePost as jest.Mock;
const mockedGetDanceScoreStatus = getDanceScoreStatus as jest.Mock;
const mockedMarkDancePostUploaded = markDancePostUploaded as jest.Mock;
const mockedUploadDanceVideo = uploadDanceVideo as jest.Mock;

async function mount(clipAudioOffsetMs?: number) {
  return renderWithProviders(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: 44, right: 0, bottom: 48, left: 0 },
      }}
    >
      <DanceResultScreen
        moveId={MOVE_ID}
        clipPath="file:///tmp/dance-attempt.mp4"
        clipDuration={12.4}
        {...(clipAudioOffsetMs === undefined ? {} : { clipAudioOffsetMs })}
        onRecordAgain={onRecordAgain}
        onDone={onDone}
      />
    </SafeAreaProvider>,
    {
      queryClient: createTestQueryClient({ queries: { gcTime: 0 }, mutations: { gcTime: 0 } }),
      auth: { userId: "dancer", accessToken: "token" },
    },
  );
}

beforeEach(() => {
  mockUseIsFocused.mockReturnValue(true);
  mockUseSyncedMusicTrack.mockReset();
  mockedGetDanceMove.mockReset();
  mockedGetDanceMove.mockResolvedValue({
    id: MOVE_ID,
    bpm: MOVE_BPM,
    music: {
      id: "track",
      title: "Track",
      artist: null,
      audioUrl: MUSIC_URL,
      delayBeforeAvatarDance: DELAY_BEFORE_AVATAR_DANCE,
    },
  });
  onRecordAgain.mockReset();
  onDone.mockReset();
  mockedCreateDancePost.mockReset();
  mockedDiscardUploadingDancePost.mockReset();
  mockedGetDanceScoreStatus.mockReset();
  mockedMarkDancePostUploaded.mockReset();
  mockedUploadDanceVideo.mockReset();
});

it("holds the result controls above the system bar the clip plays under", async () => {
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockResolvedValue(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue({ id: POST_ID, status: "uploaded" });
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scored",
    hasScore: true,
    score: 96,
    isExternalScore: true,
    jobState: "completed",
  });

  await mount();
  await screen.findByText("You scored 96 points!");

  expect(screen.getByTestId("result-panel")).toHaveStyle({ paddingBottom: 48 + 24 });
});

it("replays the clip and shows the score after upload and scan completion", async () => {
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockResolvedValue(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue({ id: POST_ID, status: "uploaded" });
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scored",
    hasScore: true,
    score: 96,
    isExternalScore: true,
    jobState: "completed",
  });

  await mount();

  expect(await screen.findByText("You scored 96 points!")).toBeOnTheScreen();
  expect(mockedCreateDancePost).toHaveBeenCalledWith(
    "token",
    expect.objectContaining({ danceMoveId: MOVE_ID, videoLength: 12.4 }),
  );
  expect(mockedUploadDanceVideo).toHaveBeenCalledWith(
    "https://storage.example.test/upload",
    "file:///tmp/dance-attempt.mp4",
  );
  expect(mockedMarkDancePostUploaded).toHaveBeenCalledWith("token", POST_ID);
  expect(screen.getByRole("button", { name: "Record another dance" })).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByRole("button", { name: "Finish dance result" }));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it("keeps the clip on the result screen and retries a failed upload", async () => {
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockRejectedValueOnce(new Error("Upload unavailable"));
  mockedUploadDanceVideo.mockResolvedValueOnce(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue({ id: POST_ID, status: "uploaded" });
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scored",
    hasScore: true,
    score: 88,
    isExternalScore: false,
    jobState: "completed",
  });

  await mount();
  expect(
    await screen.findByText("Couldn't submit your dance. Please try again."),
  ).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByRole("button", { name: "Retry submitting your dance" }));
  expect(await screen.findByText("You scored 88 points!")).toBeOnTheScreen();
  expect(mockedUploadDanceVideo).toHaveBeenCalledTimes(2);
  expect(mockedDiscardUploadingDancePost).toHaveBeenCalledWith("token", POST_ID);
});

it.each([
  ["a measured offset", 12_346],
  ["a measured zero, which is a real offset", 0],
])("forwards %s to the create call", async (_label, clipAudioOffsetMs) => {
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockResolvedValue(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue({ id: POST_ID, status: "uploaded" });
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scored",
    hasScore: true,
    score: 90,
    isExternalScore: true,
    jobState: "completed",
  });

  await mount(clipAudioOffsetMs);

  expect(await screen.findByText("You scored 90 points!")).toBeOnTheScreen();
  expect(mockedCreateDancePost).toHaveBeenCalledWith(
    "token",
    expect.objectContaining({ audioOffsetMs: clipAudioOffsetMs }),
  );
});

it("omits the offset from the create call when the clip carries none", async () => {
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockResolvedValue(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue({ id: POST_ID, status: "uploaded" });
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scored",
    hasScore: true,
    score: 90,
    isExternalScore: true,
    jobState: "completed",
  });

  await mount();

  expect(await screen.findByText("You scored 90 points!")).toBeOnTheScreen();
  expect(mockedCreateDancePost.mock.calls[0]?.[1]).not.toHaveProperty("audioOffsetMs");
});

it("replays the move's track seeked to the offset measured while recording", async () => {
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockResolvedValue(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue({ id: POST_ID, status: "uploaded" });
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scored",
    hasScore: true,
    score: 91,
    isExternalScore: true,
    jobState: "completed",
  });

  await mount(9_000);

  expect(await screen.findByText("You scored 91 points!")).toBeOnTheScreen();
  expect(mockUseSyncedMusicTrack).toHaveBeenLastCalledWith(expect.anything(), {
    audioUrl: MUSIC_URL,
    offsetMs: 9_000,
  });
});

it("falls back to the computed timeline offset when the clip carries none", async () => {
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockResolvedValue(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue({ id: POST_ID, status: "uploaded" });
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scored",
    hasScore: true,
    score: 91,
    isExternalScore: true,
    jobState: "completed",
  });
  const expected = mergeAudioOffsetMs(MOVE_BPM, DELAY_BEFORE_AVATAR_DANCE);

  await mount();

  expect(await screen.findByText("You scored 91 points!")).toBeOnTheScreen();
  expect(expected).toBeGreaterThan(0);
  expect(mockUseSyncedMusicTrack).toHaveBeenLastCalledWith(expect.anything(), {
    audioUrl: MUSIC_URL,
    offsetMs: expected,
  });
});

it("stays silent for a move that has no music", async () => {
  mockedGetDanceMove.mockResolvedValue({ id: MOVE_ID, bpm: MOVE_BPM, music: null });
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockResolvedValue(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue({ id: POST_ID, status: "uploaded" });
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scored",
    hasScore: true,
    score: 91,
    isExternalScore: true,
    jobState: "completed",
  });

  await mount(9_000);

  expect(await screen.findByText("You scored 91 points!")).toBeOnTheScreen();
  expect(mockedGetDanceMove).toHaveBeenCalled();
  expect(mockUseSyncedMusicTrack).toHaveBeenLastCalledWith(expect.anything(), {
    audioUrl: null,
    offsetMs: 9_000,
  });
});
