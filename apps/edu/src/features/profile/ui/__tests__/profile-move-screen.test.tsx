import {
  type LearnedMoveSnapshot,
  learnedMovesAtom,
  personalRecordingsAtom,
  recordFirstScanAtom,
  savePersonalRecordingAtom,
} from "@/lib/collection";
import { type TestStore, createTestStore, renderWithProviders } from "@bnewapp/mobile-kit/testing";
import { act, fireEventAsync, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { ProfileMoveScreen } from "../profile-move-screen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (href: string) => mockPush(href) } }));

jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));

jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (url: string, setup: (player: unknown) => void) => {
    const player = { loop: false, muted: false, play: jest.fn(), pause: jest.fn(), url };
    setup(player);
    return player;
  },
}));

jest.mock("@/features/scan/recording-store", () => ({
  personalRecordingUri: (fileName: string) => `file:///documents/${fileName}`,
  deletePersonalRecordingFile: jest.fn(),
}));

// The store rejects a write by keeping the record, which is the only failure the delete
// order leaves any UI to retry from.
const mockRejectPointerWrite = { current: false };
jest.mock("@/lib/collection", () => {
  const actual = jest.requireActual<typeof import("@/lib/collection")>("@/lib/collection");
  const { atom } = require("jotai") as typeof import("jotai");
  return {
    ...actual,
    deletePersonalRecordingAtom: atom(null, (_get, set, moveId: string) => {
      if (mockRejectPointerWrite.current) return;
      set(actual.deletePersonalRecordingAtom, moveId);
    }),
  };
});

const { deletePersonalRecordingFile } = jest.requireMock("@/features/scan/recording-store") as {
  deletePersonalRecordingFile: jest.Mock;
};

const MOVE_ID = "move-a";
const FILE_NAME = "move-a-1.mp4";
const onBack = jest.fn();

const SNAPSHOT: LearnedMoveSnapshot = {
  title: "Two Step",
  thumbnailUrl: null,
  genreIds: ["hip-hop"],
  level: 2,
  videoUrl: "https://cdn.example.test/two-step.mp4",
};

function storeWithLearnedMove(options: { withRecording: boolean }): TestStore {
  const { store } = createTestStore({ auth: { userId: "dancer", accessToken: "token" } });
  store.set(recordFirstScanAtom, {
    moveId: MOVE_ID,
    score: 82,
    isExternalScore: true,
    snapshot: SNAPSHOT,
  });
  if (options.withRecording) {
    store.set(savePersonalRecordingAtom, { moveId: MOVE_ID, fileName: FILE_NAME, durationS: 8 });
  }
  return store;
}

async function mount(store: TestStore) {
  await renderWithProviders(<ProfileMoveScreen moveId={MOVE_ID} onBack={onBack} />, { store });
}

/** Runs the destructive choice of the confirmation the tap opened. */
async function confirmDelete(label = "Delete my video") {
  await fireEventAsync.press(screen.getByLabelText(label));
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as Array<{
    style?: string;
    onPress?: () => void;
  }>;
  const destructive = buttons.find((button) => button.style === "destructive");
  await act(async () => destructive?.onPress?.());
}

beforeEach(() => {
  mockPush.mockReset();
  onBack.mockReset();
  deletePersonalRecordingFile.mockReset();
  mockRejectPointerWrite.current = false;
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("renders the snapshot's title and saved score, and sends Scan Again into the flow", async () => {
  await mount(storeWithLearnedMove({ withRecording: false }));

  expect(screen.getByText("Two Step")).toBeOnTheScreen();
  expect(screen.getByText("82")).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByLabelText("Scan Again, Two Step"));
  expect(mockPush).toHaveBeenCalledWith(`/move/${MOVE_ID}/scan`);
});

it("offers My Video only when a recording exists", async () => {
  await mount(storeWithLearnedMove({ withRecording: false }));

  expect(screen.queryByText("My Video")).toBeNull();
  expect(screen.queryByLabelText("Delete my video")).toBeNull();
});

it("deletes the pointer first and then the file, leaving the learned move and its score", async () => {
  const store = storeWithLearnedMove({ withRecording: true });
  await mount(store);
  expect(screen.getByText("My Video")).toBeOnTheScreen();

  await confirmDelete();

  expect(screen.queryByText("My Video")).toBeNull();
  expect(deletePersonalRecordingFile).toHaveBeenCalledWith(FILE_NAME);
  expect(store.get(personalRecordingsAtom)[MOVE_ID]).toBeUndefined();
  expect(store.get(learnedMovesAtom)[MOVE_ID]?.savedScore).toBe(82);
  expect(screen.getByText("Two Step")).toBeOnTheScreen();
});

it("keeps the video on screen with a Retry when the pointer write is rejected", async () => {
  mockRejectPointerWrite.current = true;
  const store = storeWithLearnedMove({ withRecording: true });
  await mount(store);

  await confirmDelete();

  expect(screen.getByText("Couldn't delete your video")).toBeOnTheScreen();
  expect(screen.getByText("My Video")).toBeOnTheScreen();
  // The file outlives a pointer that is still there; deleting it would be the one state
  // that renders a broken video.
  expect(deletePersonalRecordingFile).not.toHaveBeenCalled();

  mockRejectPointerWrite.current = false;
  await act(async () => {
    await fireEventAsync.press(screen.getByLabelText("Retry deleting my video"));
  });

  expect(screen.queryByText("My Video")).toBeNull();
  expect(deletePersonalRecordingFile).toHaveBeenCalledWith(FILE_NAME);
  expect(store.get(personalRecordingsAtom)[MOVE_ID]).toBeUndefined();
});

it("offers a way back for a move id that is not in the collection", async () => {
  const { store } = createTestStore({ auth: { userId: "dancer", accessToken: "token" } });

  await mount(store);

  expect(screen.getByText("Not in your collection")).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByLabelText("Back to profile"));
  expect(onBack).toHaveBeenCalled();
});
