import { CURRENT_VERSION, DEFAULT_TEMPLATE_ID } from "@bnewapp/studio-core";
import type { ExploreRoom } from "@bnewapp/types";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
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

function mountRoom(ownerId = "owner-1") {
  const store = createStore();
  store.set(
    queryClientAtom,
    new QueryClient({
      defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
    }),
  );
  store.set(queryAuthAtom, { userId: "viewer", accessToken: "token" });
  render(
    <Provider store={store}>
      <ExploreRoomScreen ownerId={ownerId} />
    </Provider>,
  );
}

beforeEach(() => {
  mockedGetRoom.mockReset();
  mockedBack.mockReset();
});

it("renders the visited room and a working back control on success", async () => {
  mockedGetRoom.mockResolvedValue(room());
  mountRoom();

  await screen.findByText("dancer-neo");
  // The stage is hidden from assistive tech (the card summarizes it), so query
  // through the hidden elements to confirm it rendered.
  expect(screen.getByTestId("studio-stage", { includeHiddenElements: true })).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Go back"));
  expect(mockedBack).toHaveBeenCalledTimes(1);
});

it("shows a not-found state when the owner has no room", async () => {
  mockedGetRoom.mockResolvedValue(null);
  mountRoom();

  await screen.findByText("Studio not found");
});

it("shows an error state with a retry when the request fails", async () => {
  mockedGetRoom.mockRejectedValue(new Error("boom"));
  mountRoom();

  await screen.findByText("Couldn't load this studio");
  expect(screen.getByLabelText("Retry loading this studio")).toBeTruthy();
});
