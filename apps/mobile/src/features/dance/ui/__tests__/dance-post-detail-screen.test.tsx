import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import type { DancePostDetail } from "@bnewapp/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEventAsync, renderAsync, screen } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { getDancePost } from "../../api";
import { DancePostDetailScreen } from "../dance-post-detail-screen";

jest.mock("../../api", () => ({ getDancePost: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));
jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (source: string | null) => {
    mockPlayerSources.push(source);
    return { play: jest.fn(), pause: jest.fn() };
  },
}));

const mockPlayerSources: Array<string | null> = [];

const POST_ID = "00000000-0000-4000-8000-000000000010";
const MOVE_ID = "00000000-0000-4000-8000-000000000001";
const mockedGetDancePost = getDancePost as jest.Mock;

function post(overrides: Partial<DancePostDetail> = {}): DancePostDetail {
  return {
    id: POST_ID,
    danceMoveId: MOVE_ID,
    musicId: null,
    status: "scored",
    score: 92,
    videoLengthS: 72,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    mergedVideoUrl: null,
    thumbnailUrl: null,
    thumbnailPath: null,
    blurhash: null,
    videoUrl: "https://storage.example.test/attempt.mp4",
    danceMove: {
      title: "Electric Slide",
      description: "Start with the groove.",
      music: { title: "The Track", artist: "The Artist" },
    },
    ...overrides,
  };
}

async function mount(onBack = jest.fn()) {
  const store = createStore();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  });
  store.set(queryClientAtom, queryClient);
  store.set(queryAuthAtom, { userId: "dancer", accessToken: "token" });
  await renderAsync(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <DancePostDetailScreen postId={POST_ID} onBack={onBack} />
      </Provider>
    </QueryClientProvider>,
  );
  return onBack;
}

beforeEach(() => {
  mockedGetDancePost.mockReset();
});

it("shows a detail skeleton while the recorded dance is loading", async () => {
  mockedGetDancePost.mockReturnValue(new Promise(() => {}));

  await mount();

  expect(screen.getByText("DANCE DETAIL")).toBeOnTheScreen();
  expect(screen.queryByTestId("dance-post-detail-video")).not.toBeOnTheScreen();
});

it("renders the recorded video, move details, and stats", async () => {
  mockedGetDancePost.mockResolvedValue(post());

  const onBack = await mount();

  expect(await screen.findByText("Electric Slide")).toBeOnTheScreen();
  expect(screen.getByTestId("dance-post-detail-video")).toBeOnTheScreen();
  expect(screen.getByText("92%")).toBeOnTheScreen();
  expect(screen.getByText("1:12")).toBeOnTheScreen();
  expect(screen.getByText("The Track · The Artist")).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByRole("button", { name: "Go back" }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

it("shows an error and retries the detail request", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    mockedGetDancePost.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(post());

    await mount();

    await screen.findByText("Couldn't load this recorded dance");
    await fireEventAsync.press(screen.getByRole("button", { name: "Retry loading dance" }));
    expect(await screen.findByText("Electric Slide")).toBeOnTheScreen();
  } finally {
    consoleError.mockRestore();
  }
});

it("plays the merged video and covers the player with the poster until the first frame", async () => {
  mockPlayerSources.length = 0;
  mockedGetDancePost.mockResolvedValue(
    post({
      mergedVideoUrl: "https://storage.example.test/attempt-merged.mp4",
      thumbnailUrl: "https://storage.example.test/attempt.jpg?token=rotates",
      thumbnailPath: "dancer/attempt.jpg",
      blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
    }),
  );

  await mount();

  expect(await screen.findByTestId("dance-post-detail-video")).toBeOnTheScreen();
  expect(mockPlayerSources).toContain("https://storage.example.test/attempt-merged.mp4");
  const poster = screen.getByTestId("dance-post-detail-poster");
  expect(poster.props.source).toEqual([
    {
      uri: "https://storage.example.test/attempt.jpg?token=rotates",
      cacheKey: "dancer/attempt.jpg",
    },
  ]);

  await fireEventAsync(screen.getByTestId("dance-post-detail-video"), "firstFrameRender");
  expect(screen.queryByTestId("dance-post-detail-poster")).not.toBeOnTheScreen();
});

it("keeps playing the original silent recording until the merge lands", async () => {
  mockPlayerSources.length = 0;
  mockedGetDancePost.mockResolvedValue(post());

  await mount();

  expect(await screen.findByTestId("dance-post-detail-video")).toBeOnTheScreen();
  expect(mockPlayerSources).toContain("https://storage.example.test/attempt.mp4");
  expect(screen.queryByTestId("dance-post-detail-poster")).not.toBeOnTheScreen();
});
