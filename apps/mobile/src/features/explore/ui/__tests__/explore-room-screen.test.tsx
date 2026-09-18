import { renderWithProviders } from "@bnewapp/mobile-kit/testing";
import { CURRENT_VERSION, DEFAULT_TEMPLATE_ID } from "@bnewapp/studio-core";
import type { VisitedStudioRoom } from "@bnewapp/types";
import { fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { visitExploreRoom } from "../../api";
import { ExploreRoomScreen } from "../explore-room-screen";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("../../api", () => ({ visitExploreRoom: jest.fn(), getExploreRooms: jest.fn() }));

const mockedGetRoom = visitExploreRoom as jest.Mock;
const mockedBack = router.back as jest.Mock;

function room(): VisitedStudioRoom {
  return {
    ownerId: "owner-1",
    username: "dancer-neo",
    snapshot: { version: CURRENT_VERSION, templateId: DEFAULT_TEMPLATE_ID, map: {} },
    updatedAt: "2026-08-01T00:00:00.000Z",
    visitorCount: 12,
  };
}

async function mountRoom(ownerId = "owner-1") {
  await renderWithProviders(<ExploreRoomScreen ownerId={ownerId} />, {
    auth: { userId: "viewer", accessToken: "token" },
  });
}

beforeEach(() => {
  mockedGetRoom.mockReset();
  mockedBack.mockReset();
});

it("renders the visited room and a working back control on success", async () => {
  mockedGetRoom.mockResolvedValue(room());
  await mountRoom();

  await screen.findByText("dancer-neo");
  expect(screen.getByText("Visitors: 12")).toBeOnTheScreen();
  expect(screen.getByLabelText("12 room visitors")).toBeOnTheScreen();
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
