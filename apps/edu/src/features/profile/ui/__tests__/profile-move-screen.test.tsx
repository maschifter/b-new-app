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

jest.mock("expo-media-library", () => ({
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
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

const mediaLibrary = jest.requireMock("expo-media-library") as {
  requestPermissionsAsync: jest.Mock;
  saveToLibraryAsync: jest.Mock;
};

const sharing = jest.requireMock("expo-sharing") as {
  isAvailableAsync: jest.Mock;
  shareAsync: jest.Mock;
};

const MOVE_ID = "move-a";
const FILE_NAME = "move-a-1.mp4";
const VIDEO_URI = `file:///documents/${FILE_NAME}`;
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
  mediaLibrary.requestPermissionsAsync.mockReset().mockResolvedValue({
    granted: true,
    canAskAgain: true,
  });
  mediaLibrary.saveToLibraryAsync.mockReset().mockResolvedValue(undefined);
  sharing.isAvailableAsync.mockReset().mockResolvedValue(true);
  sharing.shareAsync.mockReset().mockResolvedValue(undefined);
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
  expect(screen.queryByLabelText("Download my video")).toBeNull();
  expect(screen.queryByLabelText("Share my video")).toBeNull();
});

it("asks for gallery access at the Download tap, never at mount, then saves the file", async () => {
  await mount(storeWithLearnedMove({ withRecording: true }));
  expect(mediaLibrary.requestPermissionsAsync).not.toHaveBeenCalled();

  await fireEventAsync.press(screen.getByLabelText("Download my video"));

  // Write-only, video-only: the app saves one clip and never reads the library back.
  expect(mediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true, ["video"]);
  expect(mediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith(VIDEO_URI);
  expect(screen.getByText("Saved to your gallery")).toBeOnTheScreen();
});

it("keeps the video and explains the next step when Download is refused or fails", async () => {
  mediaLibrary.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
  const store = storeWithLearnedMove({ withRecording: true });
  await mount(store);

  await fireEventAsync.press(screen.getByLabelText("Download my video"));

  expect(mediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
  expect(
    screen.getByText("Allow gallery access for Stepz in Settings, then tap Download again."),
  ).toBeOnTheScreen();
  expect(screen.getByText("My Video")).toBeOnTheScreen();
  expect(store.get(personalRecordingsAtom)[MOVE_ID]?.fileName).toBe(FILE_NAME);

  mediaLibrary.requestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  mediaLibrary.saveToLibraryAsync.mockRejectedValue(new Error("the gallery is full"));

  await fireEventAsync.press(screen.getByLabelText("Download my video"));

  expect(screen.getByText("Couldn't save to your gallery. Try again.")).toBeOnTheScreen();
  expect(screen.getByText("My Video")).toBeOnTheScreen();
  expect(store.get(personalRecordingsAtom)[MOVE_ID]?.fileName).toBe(FILE_NAME);
});

it("shares the resolved file, and a cancelled share changes nothing", async () => {
  const store = storeWithLearnedMove({ withRecording: true });
  await mount(store);

  await fireEventAsync.press(screen.getByLabelText("Share my video"));

  expect(sharing.shareAsync).toHaveBeenCalledWith(
    VIDEO_URI,
    expect.objectContaining({
      mimeType: "video/mp4",
    }),
  );
  // A cancelled sheet resolves like a completed one, so this is that case too: no
  // message, no pointer change, and the recording still on screen.
  expect(screen.queryByText("Couldn't share your video. Try again.")).toBeNull();
  expect(store.get(personalRecordingsAtom)[MOVE_ID]?.fileName).toBe(FILE_NAME);
  expect(store.get(learnedMovesAtom)[MOVE_ID]?.savedScore).toBe(82);
  expect(screen.getByText("My Video")).toBeOnTheScreen();
});

it("reports a device that cannot share instead of failing silently", async () => {
  sharing.isAvailableAsync.mockResolvedValue(false);
  await mount(storeWithLearnedMove({ withRecording: true }));

  await fireEventAsync.press(screen.getByLabelText("Share my video"));

  expect(sharing.shareAsync).not.toHaveBeenCalled();
  expect(screen.getByText("Sharing isn't available on this device.")).toBeOnTheScreen();
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
