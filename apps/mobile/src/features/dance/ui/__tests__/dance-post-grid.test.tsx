import { getDancePosts } from "@bnewapp/dance-flow/api";
import { renderWithProviders } from "@bnewapp/mobile-kit/testing";
import type { DancePostsPage } from "@bnewapp/types";
import { act, fireEvent, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Text } from "react-native";
import { DancePostGrid } from "../dance-post-grid";

jest.mock("@bnewapp/dance-flow/api", () => ({ getDancePosts: jest.fn() }));
jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (_url: string, setup: (player: { muted: boolean }) => void) => {
    const player = { muted: false };
    setup(player);
    return player;
  },
}));

const mockedGetDancePosts = getDancePosts as jest.Mock;

function page(items: DancePostsPage["items"]): DancePostsPage {
  return { items, nextCursor: null };
}

function post(
  overrides: Partial<DancePostsPage["items"][number]> = {},
): DancePostsPage["items"][number] {
  return {
    id: "one",
    danceMoveId: "move",
    musicId: null,
    status: "scored",
    score: 92,
    videoLengthS: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    mergedVideoUrl: null,
    thumbnailUrl: null,
    thumbnailPath: null,
    blurhash: null,
    videoUrl: "https://storage.example.test/one.mp4",
    ...overrides,
  };
}

async function mount(header?: ReactElement, onOpenPost?: (postId: string) => void) {
  await renderWithProviders(<DancePostGrid header={header} onOpenPost={onOpenPost} />, {
    auth: { userId: "dancer", accessToken: "token" },
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockedGetDancePosts.mockReset();
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

it("shows loading feedback while the profile history is loading", async () => {
  mockedGetDancePosts.mockReturnValue(new Promise(() => {}));

  await mount();

  expect(screen.getByTestId("profile-dances-loading")).toBeOnTheScreen();
});

it("renders the recorded dances as a three-column video grid", async () => {
  mockedGetDancePosts.mockResolvedValue(page([post()]));

  await mount(<Text>Profile header</Text>);

  expect(await screen.findByTestId("profile-dance-grid")).toBeOnTheScreen();
  expect(screen.getByText("Profile header")).toBeOnTheScreen();
  expect(await screen.findByTestId("profile-dance-video")).toBeOnTheScreen();
  expect(screen.getByText("92%")).toBeOnTheScreen();
});

it("opens the selected recorded dance when a profile cell is pressed", async () => {
  const onOpenPost = jest.fn();
  mockedGetDancePosts.mockResolvedValue(page([post()]));

  await mount(undefined, onOpenPost);

  fireEvent.press(await screen.findByLabelText("Open recorded dance"));
  expect(onOpenPost).toHaveBeenCalledWith("one");
});

it("explains an empty profile history", async () => {
  mockedGetDancePosts.mockResolvedValue(page([]));
  await mount();
  expect(await screen.findByText("No dances yet")).toBeOnTheScreen();
});

it("renders a poster cell instead of a video player once the media job lands", async () => {
  mockedGetDancePosts.mockResolvedValue(
    page([
      post({
        thumbnailUrl: "https://storage.example.test/one.jpg?token=first",
        thumbnailPath: "dancer/one.jpg",
        blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
      }),
    ]),
  );

  await mount();

  const poster = await screen.findByTestId("profile-dance-poster");
  expect(poster).toBeOnTheScreen();
  // The whole point: no mounted video player per grid cell.
  expect(screen.queryByTestId("profile-dance-video")).not.toBeOnTheScreen();
  // expo-image normalizes a blurhash placeholder into its own source URI.
  expect(poster.props.placeholder[0].uri).toContain("LEHV6nWB2yk8pyo0adR*.7kCMdnj");
});

it("keys the poster cache on the storage path, not the rotating signed URL", async () => {
  mockedGetDancePosts.mockResolvedValue(
    page([
      post({
        thumbnailUrl: "https://storage.example.test/one.jpg?token=rotates-every-request",
        thumbnailPath: "dancer/one.jpg",
      }),
    ]),
  );

  await mount();

  expect((await screen.findByTestId("profile-dance-poster")).props.source).toEqual([
    {
      uri: "https://storage.example.test/one.jpg?token=rotates-every-request",
      cacheKey: "dancer/one.jpg",
    },
  ]);
});
