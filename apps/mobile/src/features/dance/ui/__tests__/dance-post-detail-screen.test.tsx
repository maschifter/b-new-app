import { deleteRecordedDancePost, getDancePost } from "@bnewapp/dance-flow/api";
import { createTestQueryClient, renderWithProviders } from "@bnewapp/mobile-kit/testing";
import type { DancePostDetail } from "@bnewapp/types";
import { InfiniteQueryObserver } from "@tanstack/react-query";
import { act, fireEventAsync, screen, waitFor } from "@testing-library/react-native";
import { dancePostDetailQueryKey, dancePostsQueryKey } from "../../_atoms/queries";
import { DancePostDetailScreen } from "../dance-post-detail-screen";

jest.mock("@bnewapp/dance-flow/api", () => ({
  getDancePost: jest.fn(),
  deleteRecordedDancePost: jest.fn(),
}));
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
  await renderWithProviders(<DancePostDetailScreen postId={POST_ID} onBack={onBack} />, {
    queryClient: createTestQueryClient({ mutations: { gcTime: Number.POSITIVE_INFINITY } }),
    auth: { userId: "dancer", accessToken: "token" },
  });
  return onBack;
}

beforeEach(() => {
  mockedGetDancePost.mockReset();
  jest.mocked(deleteRecordedDancePost).mockReset();
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

it("requires confirmation, deletes once, and returns to the profile", async () => {
  mockedGetDancePost.mockResolvedValue(post());
  let finish: (() => void) | undefined;
  jest.mocked(deleteRecordedDancePost).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const onBack = await mount();
  await screen.findByText("Electric Slide");
  await fireEventAsync.press(screen.getByRole("button", { name: "Post options" }));
  await fireEventAsync.press(screen.getByRole("button", { name: "Delete post" }));
  expect(deleteRecordedDancePost).not.toHaveBeenCalled();
  await fireEventAsync.press(screen.getByRole("button", { name: "Confirm delete post" }));
  expect(await screen.findByText(/Deleting/)).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByRole("button", { name: "Confirm delete post" }));
  expect(deleteRecordedDancePost).toHaveBeenCalledTimes(1);
  expect(deleteRecordedDancePost).toHaveBeenCalledWith("token", POST_ID);
  await act(async () => finish?.());
  await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
});

it("removes the deleted post from cached profile pages without changing another user's history", async () => {
  mockedGetDancePost.mockResolvedValue(post());
  jest.mocked(deleteRecordedDancePost).mockResolvedValue(undefined);
  const queryClient = createTestQueryClient({ mutations: { gcTime: Number.POSITIVE_INFINITY } });
  const history = { pages: [{ items: [post()], nextCursor: null }], pageParams: [null] };
  queryClient.setQueryData(dancePostsQueryKey("dancer"), history);
  queryClient.setQueryData(dancePostsQueryKey("other-user"), history);
  const fetchHistory = jest.fn(async () => history.pages[0]);
  const observer = new InfiniteQueryObserver(queryClient, {
    queryKey: dancePostsQueryKey("dancer"),
    queryFn: fetchHistory,
    initialPageParam: null,
    getNextPageParam: () => undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const unsubscribe = observer.subscribe(() => {});
  const onBack = jest.fn(() => {
    expect(screen.queryByRole("button", { name: "Confirm delete post" })).toBeNull();
  });
  await renderWithProviders(<DancePostDetailScreen postId={POST_ID} onBack={onBack} />, {
    queryClient,
    auth: { userId: "dancer", accessToken: "token" },
  });
  await screen.findByText("Electric Slide");
  await fireEventAsync.press(screen.getByRole("button", { name: "Post options" }));
  await fireEventAsync.press(screen.getByRole("button", { name: "Delete post" }));
  await fireEventAsync.press(screen.getByRole("button", { name: "Confirm delete post" }));
  await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  expect(queryClient.getQueryData(dancePostsQueryKey("dancer"))).toEqual({
    pages: [{ items: [], nextCursor: null }],
    pageParams: [null],
  });
  expect(queryClient.getQueryData(dancePostsQueryKey("other-user"))).toEqual(history);
  // The deleted post must not keep its detail — and dropping it must not make the screen
  // it is still mounted on refetch a post the server has already removed.
  expect(queryClient.getQueryData(dancePostDetailQueryKey("dancer", POST_ID))).toBeUndefined();
  expect(fetchHistory).not.toHaveBeenCalled();
  expect(mockedGetDancePost).toHaveBeenCalledTimes(1);
  unsubscribe();
});

it.each(["success", "failure"])(
  "does not navigate after leaving a pending delete (%s)",
  async (outcome) => {
    mockedGetDancePost.mockResolvedValue(post());
    let complete: (() => void) | undefined;
    jest.mocked(deleteRecordedDancePost).mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          complete = () => (outcome === "success" ? resolve() : reject(new Error("offline")));
        }),
    );
    const onBack = jest.fn();
    const { unmountAsync } = await renderWithProviders(
      <DancePostDetailScreen postId={POST_ID} onBack={onBack} />,
      {
        queryClient: createTestQueryClient({ mutations: { gcTime: Number.POSITIVE_INFINITY } }),
        auth: { userId: "dancer", accessToken: "token" },
      },
    );
    await screen.findByText("Electric Slide");
    await fireEventAsync.press(screen.getByRole("button", { name: "Post options" }));
    await fireEventAsync.press(screen.getByRole("button", { name: "Delete post" }));
    await fireEventAsync.press(screen.getByRole("button", { name: "Confirm delete post" }));
    await unmountAsync();
    await act(async () => complete?.());
    expect(onBack).not.toHaveBeenCalled();
  },
);

it("cancels deletion and allows retry after an API failure", async () => {
  mockedGetDancePost.mockResolvedValue(post());
  jest
    .mocked(deleteRecordedDancePost)
    .mockReset()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(undefined);
  const onBack = await mount();
  await screen.findByText("Electric Slide");
  await fireEventAsync.press(screen.getByRole("button", { name: "Post options" }));
  await fireEventAsync.press(screen.getByRole("button", { name: "Delete post" }));
  await fireEventAsync.press(screen.getByRole("button", { name: "Cancel" }));
  expect(deleteRecordedDancePost).not.toHaveBeenCalled();
  await fireEventAsync.press(screen.getByRole("button", { name: "Post options" }));
  await fireEventAsync.press(screen.getByRole("button", { name: "Delete post" }));
  await fireEventAsync.press(screen.getByRole("button", { name: "Confirm delete post" }));
  expect(await screen.findByText("Couldn't delete this post. Please try again.")).toBeOnTheScreen();
  expect(onBack).not.toHaveBeenCalled();
  await fireEventAsync.press(screen.getByRole("button", { name: "Confirm delete post" }));
  await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
});
