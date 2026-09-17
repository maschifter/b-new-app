// `expo-file-system` is mocked here and not in `apps/edu/__mocks__/`: a mock adjacent to
// `node_modules` is applied automatically to every suite in the app.
const mockFiles = new Map<string, number>();
const mockDirectories = new Set<string>();
const mockFsCalls: string[] = [];
const mockFailCopy = { value: false };

jest.mock("expo-file-system", () => {
  function join(parts: unknown[]): string {
    return parts
      .map((part) => (typeof part === "string" ? part : (part as { uri: string }).uri))
      .reduce((left, right) => (left.endsWith("/") ? `${left}${right}` : `${left}/${right}`));
  }

  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockDirectories.has(this.uri);
    }
    create() {
      mockDirectories.add(this.uri);
    }
    list() {
      const prefix = `${this.uri}/`;
      return [...mockFiles.keys()]
        .filter((uri) => uri.startsWith(prefix))
        .map((uri) => new File(uri));
    }
  }

  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri) ?? 0;
    }
    copy(destination: { uri: string }) {
      if (mockFailCopy.value) throw new Error("copy failed");
      mockFsCalls.push(`copy:${this.uri}->${destination.uri}`);
      const size = mockFiles.get(this.uri);
      if (size === undefined) throw new Error(`no such file: ${this.uri}`);
      mockFiles.set(destination.uri, size);
    }
    delete() {
      mockFsCalls.push(`delete:${this.uri}`);
      mockFiles.delete(this.uri);
    }
  }

  return { Directory, File, Paths: { document: "file:///document", cache: "file:///cache" } };
});

jest.mock("@bnewapp/dance-flow/api", () => ({
  createDancePost: jest.fn(),
  deleteRecordedDancePost: jest.fn(),
  discardUploadingDancePost: jest.fn(),
  getDanceMove: jest.fn(),
  getDanceScoreStatus: jest.fn(),
  markDancePostUploaded: jest.fn(),
  uploadDanceVideo: jest.fn(),
}));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));
jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (
    _source: string,
    configure: (player: { loop: boolean; muted: boolean }) => void,
  ) => {
    const player = { loop: false, muted: false, play: jest.fn(), pause: jest.fn() };
    configure(player);
    return player;
  },
}));

import {
  averageScoreAtom,
  learnedMovesAtom,
  personalRecordingsAtom,
  recordFirstScanAtom,
  savePersonalRecordingAtom,
} from "@/lib/collection";
import {
  createDancePost,
  deleteRecordedDancePost,
  getDanceMove,
  getDanceScoreStatus,
  markDancePostUploaded,
  uploadDanceVideo,
} from "@bnewapp/dance-flow/api";
import {
  type TestStore,
  createTestQueryClient,
  createTestStore,
} from "@bnewapp/mobile-kit/testing";
import type { DanceMove } from "@bnewapp/types";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEventAsync, screen, waitFor } from "@testing-library/react-native";
import { renderAsync } from "@testing-library/react-native";
import { Provider } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { BackHandler } from "react-native";
import { ScanResultScreen } from "../scan-result-screen";

const MOVE_ID = "00000000-0000-4000-8000-000000000001";
const POST_ID = "00000000-0000-4000-8000-000000000010";
const CLIP = "file:///cache/VisionCamera/attempt.mov";
const RECORDINGS = "file:///document/personal-recordings";
const EXISTING_NAME = `${MOVE_ID}-1.mp4`;
const EXISTING_VIDEO = `${RECORDINGS}/${EXISTING_NAME}`;

const MOVE: DanceMove = {
  id: MOVE_ID,
  title: "Two Step",
  description: null,
  level: 2,
  bpm: 120,
  thumbnailUrl: "https://cdn.test/thumb.jpg",
  mainVideoUrl: "https://cdn.test/main.mp4",
  proDancerVideoUrl: null,
  proDancerImageUrl: null,
  dancerTipVideoUrl: null,
  dancerTipImageUrl: null,
  presentationVideoUrl: null,
  filmYourselfVideoUrl: "https://cdn.test/film-yourself.mp4",
  genreIds: ["hiphop"],
  music: null,
  sortOrder: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const SNAPSHOT = {
  title: "Two Step",
  thumbnailUrl: "https://cdn.test/thumb.jpg",
  genreIds: ["hiphop"],
  level: 2,
  videoUrl: "https://cdn.test/main.mp4",
};

const mockedCreateDancePost = createDancePost as jest.Mock;
const mockedDeleteRecordedDancePost = deleteRecordedDancePost as jest.Mock;
const mockedGetDanceMove = getDanceMove as jest.Mock;
const mockedGetDanceScoreStatus = getDanceScoreStatus as jest.Mock;
const mockedMarkDancePostUploaded = markDancePostUploaded as jest.Mock;
const mockedUploadDanceVideo = uploadDanceVideo as jest.Mock;

const onBack = jest.fn();
const onFinished = jest.fn();

let backPressHandler: (() => boolean | null | undefined) | null = null;

function newStore(): TestStore {
  return createTestStore({
    auth: { userId: "dancer", accessToken: "token" },
    queryClient: createTestQueryClient({ queries: { gcTime: 0 }, mutations: { gcTime: 0 } }),
  }).store;
}

// `renderWithProviders` builds its own store when none is passed; these tests always
// seed one first, so the provider tree is wired here from that same store.
async function mount(store: TestStore) {
  return renderAsync(
    <QueryClientProvider client={store.get(queryClientAtom)}>
      <Provider store={store}>
        <ScanResultScreen
          moveId={MOVE_ID}
          clipPath={CLIP}
          clipDuration={12.4}
          onBack={onBack}
          onFinished={onFinished}
        />
      </Provider>
    </QueryClientProvider>,
  );
}

function uploadSucceeds() {
  mockedCreateDancePost.mockResolvedValue({
    postId: POST_ID,
    upload: { signedUrl: "https://storage.test/upload", path: "dancer/attempt.mp4" },
  });
  mockedUploadDanceVideo.mockResolvedValue(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue({ id: POST_ID, status: "uploaded" });
}

function scanScores(score: number, isExternalScore = true) {
  uploadSucceeds();
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "scored",
    hasScore: true,
    score,
    isExternalScore,
    jobState: "completed",
  });
}

function scanFails() {
  uploadSucceeds();
  mockedGetDanceScoreStatus.mockResolvedValue({
    status: "failed",
    hasScore: false,
    score: null,
    isExternalScore: false,
    jobState: "failed",
  });
}

function learn(store: TestStore, score: number) {
  store.set(recordFirstScanAtom, {
    moveId: MOVE_ID,
    score,
    isExternalScore: true,
    snapshot: SNAPSHOT,
  });
}

async function confirmScore() {
  await fireEventAsync.press(screen.getByRole("button", { name: "Continue and Save your Score" }));
}

beforeEach(() => {
  mockFiles.clear();
  mockDirectories.clear();
  mockFsCalls.length = 0;
  mockFailCopy.value = false;
  backPressHandler = null;
  onBack.mockReset();
  onFinished.mockReset();
  mockedCreateDancePost.mockReset();
  mockedDeleteRecordedDancePost.mockReset().mockResolvedValue(undefined);
  mockedGetDanceMove.mockReset().mockResolvedValue(MOVE);
  mockedGetDanceScoreStatus.mockReset();
  mockedMarkDancePostUploaded.mockReset();
  mockedUploadDanceVideo.mockReset();
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
    backPressHandler = handler;
    return { remove: jest.fn() };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the score", () => {
  it("renders the score out of 100 and the confirmation", async () => {
    scanScores(82);
    const store = newStore();

    await mount(store);

    expect(await screen.findByText("82 / 100")).toBeOnTheScreen();
    expect(screen.getByText("Two Step")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Continue and Save your Score" })).toBeOnTheScreen();
  });

  it("saves a first score automatically, with the snapshot built from the move", async () => {
    scanScores(82);
    const store = newStore();

    await mount(store);
    await screen.findByText("82 / 100");

    expect(store.get(learnedMovesAtom)[MOVE_ID]).toMatchObject({
      moveId: MOVE_ID,
      savedScore: 82,
      isExternalScore: true,
      // `resolvePreviewMedia` prefers the main video over the film-yourself fallback.
      move: SNAPSHOT,
    });
  });

  it("keeps a server fallback score's flag intact", async () => {
    scanScores(40, false);
    const store = newStore();

    await mount(store);
    await screen.findByText("40 / 100");

    expect(store.get(learnedMovesAtom)[MOVE_ID]?.isExternalScore).toBe(false);
  });

  it("writes nothing for an unconfirmed repeat scan", async () => {
    scanScores(20);
    const store = newStore();
    learn(store, 90);
    const before = store.get(learnedMovesAtom)[MOVE_ID];

    await mount(store);
    await screen.findByText("20 / 100");

    expect(store.get(learnedMovesAtom)[MOVE_ID]).toEqual(before);
    expect(store.get(averageScoreAtom)).toBe(90);
  });

  it("replaces a higher saved score with a confirmed lower one", async () => {
    scanScores(20);
    const store = newStore();
    learn(store, 90);
    const learnedAt = store.get(learnedMovesAtom)[MOVE_ID]?.learnedAt;

    await mount(store);
    await screen.findByText("20 / 100");
    await confirmScore();

    expect(store.get(learnedMovesAtom)[MOVE_ID]?.savedScore).toBe(20);
    expect(store.get(learnedMovesAtom)[MOVE_ID]?.learnedAt).toBe(learnedAt);
  });

  it("writes nothing further when a first scan's score is confirmed", async () => {
    scanScores(82);
    const store = newStore();

    await mount(store);
    await screen.findByText("82 / 100");
    const afterAutoSave = store.get(learnedMovesAtom)[MOVE_ID];
    await confirmScore();

    expect(store.get(learnedMovesAtom)[MOVE_ID]).toEqual(afterAutoSave);
  });

  it("advances once for a repeated tap on the confirmation", async () => {
    scanScores(82);
    const store = newStore();

    await mount(store);
    await screen.findByText("82 / 100");
    const button = screen.getByRole("button", { name: "Continue and Save your Score" });
    await fireEventAsync.press(button);
    await fireEventAsync.press(button);

    // No temporary clip exists, so confirming exits straight to the profile.
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("never touches a personal recording while saving a score", async () => {
    scanScores(82);
    const store = newStore();
    store.set(savePersonalRecordingAtom, {
      moveId: MOVE_ID,
      fileName: EXISTING_NAME,
      durationS: 9,
    });
    mockFiles.set(EXISTING_VIDEO, 1_024);

    await mount(store);
    await screen.findByText("82 / 100");

    expect(store.get(personalRecordingsAtom)[MOVE_ID]?.fileName).toBe(EXISTING_NAME);
    expect(mockFsCalls).toEqual([]);
  });

  it("offers Back only for a terminal state with no score", async () => {
    scanFails();
    const store = newStore();

    await mount(store);

    expect(
      await screen.findByText("Dance scoring failed. Please record another attempt."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Back" })).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "Continue and Save your Score" }),
    ).not.toBeOnTheScreen();
    expect(screen.queryByText("Save your recording too?")).not.toBeOnTheScreen();
    expect(store.get(learnedMovesAtom)).toEqual({});
  });

  it("leaves the saved score untouched when Back is pressed", async () => {
    scanScores(20);
    const store = newStore();
    learn(store, 90);

    await mount(store);
    await screen.findByText("20 / 100");
    await fireEventAsync.press(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(store.get(learnedMovesAtom)[MOVE_ID]?.savedScore).toBe(90);
  });

  it("offers Retry when the move snapshot is missing, then saves after a successful refetch", async () => {
    scanScores(82);
    mockedGetDanceMove.mockRejectedValueOnce(new Error("offline"));
    const store = newStore();

    await mount(store);

    expect(await screen.findByText("Couldn't save your score")).toBeOnTheScreen();
    expect(store.get(learnedMovesAtom)).toEqual({});

    mockedGetDanceMove.mockResolvedValue(MOVE);
    await fireEventAsync.press(screen.getByRole("button", { name: "Retry saving your score" }));
    await waitFor(() => expect(store.get(learnedMovesAtom)[MOVE_ID]?.savedScore).toBe(82));
    expect(screen.getByRole("button", { name: "Continue and Save your Score" })).toBeOnTheScreen();
  });
});

describe("the temporary cloud upload", () => {
  it("is discarded once per attempt on a terminal score", async () => {
    scanScores(82);

    await mount(newStore());
    await screen.findByText("82 / 100");

    await waitFor(() =>
      expect(mockedDeleteRecordedDancePost).toHaveBeenCalledWith("token", POST_ID),
    );
    expect(mockedDeleteRecordedDancePost).toHaveBeenCalledTimes(1);
  });

  it("is discarded for a failed scan too", async () => {
    scanFails();

    await mount(newStore());
    await screen.findByText("Dance scoring failed. Please record another attempt.");

    await waitFor(() =>
      expect(mockedDeleteRecordedDancePost).toHaveBeenCalledWith("token", POST_ID),
    );
  });

  it("hides a cleanup failure and still advances", async () => {
    scanScores(82);
    mockedDeleteRecordedDancePost.mockRejectedValue(new Error("gone"));
    const store = newStore();

    await mount(store);
    await screen.findByText("82 / 100");
    await waitFor(() => expect(mockedDeleteRecordedDancePost).toHaveBeenCalled());

    expect(screen.queryByText(/Unable to delete/)).not.toBeOnTheScreen();
    await confirmScore();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});

describe("the video decision", () => {
  it("asks nothing when no temporary recording exists", async () => {
    scanScores(82);

    await mount(newStore());
    await screen.findByText("82 / 100");
    await confirmScore();

    expect(screen.queryByText("Save your recording too?")).not.toBeOnTheScreen();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("renders document 02 section 4's strings with the move's title", async () => {
    scanScores(82);
    mockFiles.set(CLIP, 2_048);

    await mount(newStore());
    await screen.findByText("82 / 100");
    await confirmScore();

    expect(screen.getByText("Nice work!")).toBeOnTheScreen();
    expect(screen.getByText("Two Step is now in your collection.")).toBeOnTheScreen();
    expect(screen.getByText("Save your recording too?")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Your personal video is private and optional. If you choose Not Now, the temporary recording will be deleted.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save My Video" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Not Now" })).toBeOnTheScreen();
  });

  it("renders document 02 section 5's strings when a personal recording exists", async () => {
    scanScores(82);
    mockFiles.set(CLIP, 2_048);
    mockFiles.set(EXISTING_VIDEO, 1_024);
    const store = newStore();
    learn(store, 90);
    store.set(savePersonalRecordingAtom, {
      moveId: MOVE_ID,
      fileName: EXISTING_NAME,
      durationS: 9,
    });

    await mount(store);
    await screen.findByText("82 / 100");
    await confirmScore();

    expect(screen.getByText("Do you want to replace your video?")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "You can keep one personal video for each move. Saving this recording will permanently replace your previous video.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Replace Video" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Keep Existing Video" })).toBeOnTheScreen();
  });

  it("deletes the temporary file and keeps the score on Not Now", async () => {
    scanScores(82);
    mockFiles.set(CLIP, 2_048);
    const store = newStore();

    await mount(store);
    await screen.findByText("82 / 100");
    await confirmScore();
    await fireEventAsync.press(screen.getByRole("button", { name: "Not Now" }));

    expect(mockFiles.has(CLIP)).toBe(false);
    expect(store.get(personalRecordingsAtom)).toEqual({});
    expect(store.get(learnedMovesAtom)[MOVE_ID]?.savedScore).toBe(82);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("keeps the old pointer and file on Keep Existing Video, and keeps the new score", async () => {
    scanScores(20);
    mockFiles.set(CLIP, 2_048);
    mockFiles.set(EXISTING_VIDEO, 1_024);
    const store = newStore();
    learn(store, 90);
    store.set(savePersonalRecordingAtom, {
      moveId: MOVE_ID,
      fileName: EXISTING_NAME,
      durationS: 9,
    });

    await mount(store);
    await screen.findByText("20 / 100");
    await confirmScore();
    await fireEventAsync.press(screen.getByRole("button", { name: "Keep Existing Video" }));

    expect(store.get(personalRecordingsAtom)[MOVE_ID]?.fileName).toBe(EXISTING_NAME);
    expect(mockFiles.has(EXISTING_VIDEO)).toBe(true);
    expect(mockFiles.has(CLIP)).toBe(false);
    expect(store.get(learnedMovesAtom)[MOVE_ID]?.savedScore).toBe(20);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("saves the recording into the document directory", async () => {
    scanScores(82);
    mockFiles.set(CLIP, 2_048);
    const store = newStore();

    await mount(store);
    await screen.findByText("82 / 100");
    await confirmScore();
    await fireEventAsync.press(screen.getByRole("button", { name: "Save My Video" }));

    const recording = store.get(personalRecordingsAtom)[MOVE_ID];
    expect(recording?.fileName).toMatch(new RegExp(`^${MOVE_ID}-\\d+\\.mp4$`));
    expect(recording?.durationS).toBe(12.4);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("produces one recording for two taps on Save My Video", async () => {
    scanScores(82);
    mockFiles.set(CLIP, 2_048);
    const store = newStore();

    await mount(store);
    await screen.findByText("82 / 100");
    await confirmScore();
    const button = screen.getByRole("button", { name: "Save My Video" });
    await fireEventAsync.press(button);
    await fireEventAsync.press(button);

    expect(mockFsCalls.filter((call) => call.startsWith("copy:"))).toHaveLength(1);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("keeps the old pointer and offers Retry when the copy throws", async () => {
    scanScores(20);
    mockFiles.set(CLIP, 2_048);
    mockFiles.set(EXISTING_VIDEO, 1_024);
    mockFailCopy.value = true;
    const store = newStore();
    learn(store, 90);
    store.set(savePersonalRecordingAtom, {
      moveId: MOVE_ID,
      fileName: EXISTING_NAME,
      durationS: 9,
    });

    await mount(store);
    await screen.findByText("20 / 100");
    await confirmScore();
    await fireEventAsync.press(screen.getByRole("button", { name: "Replace Video" }));

    expect(store.get(personalRecordingsAtom)[MOVE_ID]?.fileName).toBe(EXISTING_NAME);
    expect(mockFiles.has(EXISTING_VIDEO)).toBe(true);
    expect(onFinished).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry replacing your video" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Keep Existing Video" })).toBeOnTheScreen();
  });

  it.each([
    ["Save My Video", false],
    ["Replace Video", true],
  ])(
    "performs the secondary action on hardware Back beside %s",
    async (_label, hasExistingRecording) => {
      scanScores(82);
      mockFiles.set(CLIP, 2_048);
      const store = newStore();
      if (hasExistingRecording) {
        mockFiles.set(EXISTING_VIDEO, 1_024);
        store.set(savePersonalRecordingAtom, {
          moveId: MOVE_ID,
          fileName: EXISTING_NAME,
          durationS: 9,
        });
      }

      await mount(store);
      await screen.findByText("82 / 100");
      await confirmScore();

      expect(backPressHandler).not.toBeNull();
      expect(backPressHandler?.()).toBe(true);

      expect(mockFiles.has(CLIP)).toBe(false);
      expect(store.get(personalRecordingsAtom)[MOVE_ID]?.fileName ?? null).toBe(
        hasExistingRecording ? EXISTING_NAME : null,
      );
      expect(onFinished).toHaveBeenCalledTimes(1);
    },
  );
});
