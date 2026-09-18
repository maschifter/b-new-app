import ScanResultRoute from "@/app/move/[moveId]/result";
import { render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Redirect: ({ href }: { href: string }) => React.createElement(Text, null, `redirect:${href}`),
    router: { dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: jest.fn(),
  };
});

const mockOnBack = jest.fn();
const mockOnFinished = jest.fn();

jest.mock("@/features/scan", () => {
  const React = require("react");
  const { Text } = require("react-native");
  // The clip parse stays real, so the route's redirect guard is exercised rather than
  // mocked away.
  return {
    ...require("@bnewapp/dance-flow/clip-params"),
    ScanResultScreen: ({ onBack, onFinished }: { onBack: () => void; onFinished: () => void }) => {
      mockOnBack.mockImplementation(onBack);
      mockOnFinished.mockImplementation(onFinished);
      return React.createElement(Text, null, "result-screen");
    },
  };
});

const mockedSearchParams = useLocalSearchParams as jest.Mock;
const MOVE_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  (router.dismissTo as jest.Mock).mockClear();
  (router.push as jest.Mock).mockClear();
  (router.replace as jest.Mock).mockClear();
  mockedSearchParams.mockReturnValue({
    moveId: MOVE_ID,
    clipPath: "file:///cache/attempt.mov",
    clipDuration: "12.4",
  });
});

it("sends Back to the scan view by replacing the route, so attempts do not stack", () => {
  render(<ScanResultRoute />);
  mockOnBack();
  expect(router.replace).toHaveBeenCalledWith(`/move/${MOVE_ID}/scan`);
});

// Document 03 section 2 requires Back from the profile to reach the feed, so the scan
// stack is dismissed before the profile is pushed.
it("dismisses the scan stack to the feed before pushing the profile", () => {
  render(<ScanResultRoute />);
  mockOnFinished();
  expect(router.dismissTo).toHaveBeenCalledWith("/");
  expect(router.push).toHaveBeenCalledWith("/profile");
  expect((router.dismissTo as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
    (router.push as jest.Mock).mock.invocationCallOrder[0] as number,
  );
});

it("redirects away from a clip path that is not local", () => {
  mockedSearchParams.mockReturnValue({
    moveId: MOVE_ID,
    clipPath: "https://cdn.test/attempt.mp4",
    clipDuration: "12.4",
  });
  render(<ScanResultRoute />);
  expect(screen.getByText("redirect:/")).toBeOnTheScreen();
});
