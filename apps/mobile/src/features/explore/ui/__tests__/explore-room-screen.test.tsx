import { CURRENT_VERSION, DEFAULT_TEMPLATE_ID } from "@bnewapp/studio-core";
import type { ExploreRoom } from "@bnewapp/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, renderAsync, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Provider, createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";

import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import { getExploreRoom } from "../../api";
import { ExploreRoomScreen } from "../explore-room-screen";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("../../api", () => ({ getExploreRoom: jest.fn(), getExploreRooms: jest.fn() }));

const mockedGetRoom = getExploreRoom as jest.Mock;
const mockedBack = router.back as jest.Mock;

function room(): ExploreRoom {
  return {
    ownerId: "owner-1",
    username: "dancer-neo",
    snapshot: { version: CURRENT_VERSION, templateId: DEFAULT_TEMPLATE_ID, map: {} },
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

async function mountRoom(ownerId = "owner-1") {
  const store = createStore();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  });
  store.set(queryClientAtom, queryClient);
  store.set(queryAuthAtom, { userId: "viewer", accessToken: "token" });
  await renderAsync(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <ExploreRoomScreen ownerId={ownerId} />
      </Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedGetRoom.mockReset();
  mockedBack.mockReset();
});

it("renders the visited room and a working back control on success", async () => {
  mockedGetRoom.mockResolvedValue(room());
  await mountRoom();

  await screen.findByText("dancer-neo");
  // The stage is hidden from assistive tech (the card summarizes it), so query
  // through the hidden elements to confirm it rendered.
  expect(screen.getByTestId("studio-stage", { includeHiddenElements: true })).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Go back"));
  expect(mockedBack).toHaveBeenCalledTimes(1);
});

it("shows a not-found state when the owner has no room", async () => {
  mockedGetRoom.mockResolvedValue(null);
  await mountRoom();

  await screen.findByText("Studio not found");
});

it("shows an error state with a retry when the request fails", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    mockedGetRoom.mockRejectedValue(new Error("boom"));
    await mountRoom();

    await screen.findByText("Couldn't load this studio");
    expect(screen.getByLabelText("Retry loading this studio")).toBeTruthy();
  } finally {
    consoleError.mockRestore();
  }
});
