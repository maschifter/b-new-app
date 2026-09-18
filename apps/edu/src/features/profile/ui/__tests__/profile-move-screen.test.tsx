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
import { MMKV } from "react-native-mmkv";
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

/**
 * Makes the device reject the one write the delete has to persist, which is the failure
 * the retry exists for. It has to come from the device: `atomWithStorage` drops its
 * in-memory value before it ever reaches storage, so nothing above it can refuse a write.
 */
function rejectRecordingWrites() {
  const write = MMKV.prototype.set;
  const device = new MMKV({ id: "edu" });
  return jest.spyOn(MMKV.prototype, "set").mockImplementation((key, value) => {
    if (key.endsWith("personal-recordings")) throw new Error("the device rejected the write");
    write.call(device, key, value);
  });
}

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

it("keeps the video on screen with a Retry when the device rejects the write", async () => {
  const store = storeWithLearnedMove({ withRecording: true });
  await mount(store);
  const rejectedWrite = rejectRecordingWrites();

  await confirmDelete();

  expect(screen.getByText("Couldn't delete your video")).toBeOnTheScreen();
  expect(screen.getByText("My Video")).toBeOnTheScreen();
  // Both halves of the rollback: the record the screen reads is the record the device
  // still holds, so the retry is offered against a state that actually exists.
  expect(store.get(personalRecordingsAtom)[MOVE_ID]?.fileName).toBe(FILE_NAME);
  // The file outlives a pointer that is still there; deleting it would be the one state
  // that renders a broken video.
  expect(deletePersonalRecordingFile).not.toHaveBeenCalled();

  rejectedWrite.mockRestore();
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
