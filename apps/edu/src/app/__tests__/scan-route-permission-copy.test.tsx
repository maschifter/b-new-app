import ScanRoute from "@/app/move/[moveId]/scan";
import type { CameraPermissionCopy } from "@bnewapp/dance-flow/record-screen";
import { render, screen } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Redirect: ({ href }: { href: string }) => React.createElement(Text, null, `redirect:${href}`),
    router: { back: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: jest.fn(),
  };
});

jest.mock("@/features/scan", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    RecordDanceScreen: ({
      cameraPermissionCopy,
    }: { cameraPermissionCopy?: CameraPermissionCopy }) =>
      React.createElement(Text, null, JSON.stringify(cameraPermissionCopy)),
  };
});

const mockedSearchParams = useLocalSearchParams as jest.Mock;
const MOVE_ID = "00000000-0000-4000-8000-000000000001";

// Document 01 section 3 mandates these four strings. The shared package keeps its own
// wording for every other consumer, so Stepz has to hand them over at the route.
it("supplies the mandated pre-prompt wording to the shared record screen", () => {
  mockedSearchParams.mockReturnValue({ moveId: MOVE_ID });
  render(<ScanRoute />);

  expect(JSON.parse(screen.getByText(/Allow camera access/).props.children as string)).toEqual({
    title: "Allow camera access",
    body: "The camera is used to scan your movement and calculate your score.",
    allowLabel: "Allow Camera",
    dismissLabel: "Not now",
  });
});
