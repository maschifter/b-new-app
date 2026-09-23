import ProTipRoute from "@/app/move/[moveId]/pro-tip";
import { render, screen } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Redirect: ({ href }: { href: string }) => React.createElement(Text, null, `redirect:${href}`),
    router: { back: jest.fn() },
    useLocalSearchParams: jest.fn(),
  };
});

jest.mock("@/features/feed", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    ProTipScreen: ({ moveId }: { moveId: string }) => React.createElement(Text, null, moveId),
  };
});

const mockedSearchParams = useLocalSearchParams as jest.Mock;
const MOVE_ID = "00000000-0000-4000-8000-000000000001";

it("mounts Pro Tip as its own move route", () => {
  mockedSearchParams.mockReturnValue({ moveId: MOVE_ID });

  render(<ProTipRoute />);

  expect(screen.getByText(MOVE_ID)).toBeOnTheScreen();
});

it("returns to the feed for an invalid move id", () => {
  mockedSearchParams.mockReturnValue({ moveId: "not-a-uuid" });

  render(<ProTipRoute />);

  expect(screen.getByText("redirect:/")).toBeOnTheScreen();
});
