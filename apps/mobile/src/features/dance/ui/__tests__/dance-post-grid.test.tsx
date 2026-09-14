import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import type { DancePostsPage } from "@bnewapp/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderAsync, screen } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import type { ReactElement } from "react";
import { Text } from "react-native";
import { getDancePosts } from "../../api";
import { DancePostGrid } from "../dance-post-grid";

jest.mock("../../api", () => ({ getDancePosts: jest.fn() }));
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

async function mount(header?: ReactElement) {
  const store = createStore();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  });
  store.set(queryClientAtom, queryClient);
  store.set(queryAuthAtom, { userId: "dancer", accessToken: "token" });
  await renderAsync(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <DancePostGrid header={header} />
      </Provider>
    </QueryClientProvider>,
  );
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
  mockedGetDancePosts.mockResolvedValue(
    page([
      {
        id: "one",
        danceMoveId: "move",
        musicId: null,
        status: "scored",
        score: 92,
        videoLengthS: 12,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        videoUrl: "https://storage.example.test/one.mp4",
      },
    ]),
  );

  await mount(<Text>Profile header</Text>);

  expect(await screen.findByTestId("profile-dance-grid")).toBeOnTheScreen();
  expect(screen.getByText("Profile header")).toBeOnTheScreen();
  expect(await screen.findByTestId("profile-dance-video")).toBeOnTheScreen();
  expect(screen.getByText("92%")).toBeOnTheScreen();
});

it("explains an empty profile history", async () => {
  mockedGetDancePosts.mockResolvedValue(page([]));
  await mount();
  expect(await screen.findByText("No dances yet")).toBeOnTheScreen();
});
