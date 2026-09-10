import RoomRoute from "@/app/room/[ownerId]";
import { render, screen } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Redirect: ({ href }: { href: string }) => React.createElement(Text, null, `redirect:${href}`),
    useLocalSearchParams: jest.fn(),
  };
});

jest.mock("@/features/explore", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    ExploreRoomScreen: ({ ownerId }: { ownerId: string }) =>
      React.createElement(Text, null, `room:${ownerId}`),
  };
});

const mockedSearchParams = useLocalSearchParams as jest.Mock;
const VALID_OWNER_ID = "550e8400-e29b-41d4-a716-446655440000";

it("renders the room screen for a valid owner id", () => {
  mockedSearchParams.mockReturnValue({ ownerId: VALID_OWNER_ID });

  render(<RoomRoute />);

  expect(screen.getByText(`room:${VALID_OWNER_ID}`)).toBeOnTheScreen();
  expect(screen.queryByText("redirect:/explore")).not.toBeOnTheScreen();
});

it.each(["", "not-a-uuid", [VALID_OWNER_ID]])(
  "redirects an invalid owner id instead of requesting the room: %p",
  (ownerId) => {
    mockedSearchParams.mockReturnValue({ ownerId });

    render(<RoomRoute />);

    expect(screen.getByText("redirect:/explore")).toBeOnTheScreen();
    expect(screen.queryByText(/^room:/)).not.toBeOnTheScreen();
  },
);
