import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEventAsync, renderAsync, screen } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import {
  createDancePost,
  discardUploadingDancePost,
  getDanceScoreStatus,
  markDancePostUploaded,
  uploadDanceVideo,
} from "../../api";
import { DanceResultScreen } from "../dance-result-screen";

const MOVE_ID = "00000000-0000-4000-8000-000000000001";
const POST_ID = "00000000-0000-4000-8000-000000000010";
const onRecordAgain = jest.fn();
const onDone = jest.fn();
const mockUseIsFocused = jest.fn(() => true);

jest.mock("../../api", () => ({
  createDancePost: jest.fn(),
  discardUploadingDancePost: jest.fn(),
  getDanceScoreStatus: jest.fn(),
  markDancePostUploaded: jest.fn(),
  uploadDanceVideo: jest.fn(),
}));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => mockUseIsFocused() }));
jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (_source: string, configure: (player: { loop: boolean; muted: boolean; play: () => void; pause: () => void }) => void) => {
    const player = { loop: false, muted: false, play: jest.fn(), pause: jest.fn() };
    configure(player);
    return player;
  },
}));

const mockedCreateDancePost = createDancePost as jest.Mock;
const mockedDiscardUploadingDancePost = discardUploadingDancePost as jest.Mock;
const mockedGetDanceScoreStatus = getDanceScoreStatus as jest.Mock;
const mockedMarkDancePostUploaded = markDancePostUploaded as jest.Mock;
const mockedUploadDanceVideo = uploadDanceVideo as jest.Mock;

async function mount() {
  const store = createStore();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { gcTime: 0 } },
  });
  store.set(queryClientAtom, queryClient);
  store.set(queryAuthAtom, { userId: "dancer", accessToken: "token" });
  return renderAsync(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <DanceResultScreen
          moveId={MOVE_ID}
          clipPath="file:///tmp/dance-attempt.mp4"
          clipDuration={12.4}
          onRecordAgain={onRecordAgain}
          onDone={onDone}
        />
      </Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockUseIsFocused.mockReturnValue(true);
  onRecordAgain.mockReset();
  onDone.mockReset();
  mockedCreateDancePost.mockReset();
  mockedDiscardUploadingDancePost.mockReset();
  mockedGetDanceScoreStatus.mockReset();
  mockedMarkDancePostUploaded.mockReset();
  mockedUploadDanceVideo.mockReset();
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
  expect(await screen.findByText("Couldn't submit your dance. Please try again.")).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByRole("button", { name: "Retry submitting your dance" }));
  expect(await screen.findByText("You scored 88 points!")).toBeOnTheScreen();
  expect(mockedUploadDanceVideo).toHaveBeenCalledTimes(2);
  expect(mockedDiscardUploadingDancePost).toHaveBeenCalledWith("token", POST_ID);
});
