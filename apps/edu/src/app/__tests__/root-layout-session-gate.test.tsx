import RootLayout from "@/app/_layout";
import { useAnonymousSession } from "@/lib/auth/session-provider";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// A Stack mock that prints each screen name, so we can assert which routes the
// real layout exposes once the anonymous identity exists.
jest.mock("expo-router", () => {
  const React = require("react");
  const { Text } = require("react-native");
  const Stack = ({ children }: { children: ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  Stack.Screen = ({ name }: { name: string }) => React.createElement(Text, null, name);
  return { Stack };
});

// The layout also mounts the developer menu, whose toggles live in the dance flow's
// persisted atoms — so the bootstrap stub still has to configure the flow.
jest.mock("@/lib/bootstrap/dance-flow", () => {
  require("@bnewapp/dance-flow/config").configureDanceFlow({
    apiUrl: "http://localhost:3000",
    mmkvId: "edu-dance",
  });
  return {};
});

// The layout mounts the genre cache's single writer. Stubbed rather than exercised: the
// write-through has its own test, and the real hook would open a catalog query against a
// client this test's stubbed QueryProvider never owns.
jest.mock("@/lib/catalog", () => ({ useGenresCache: () => undefined }));

jest.mock("@/lib/auth/session-provider", () => ({
  AnonymousSessionProvider: ({ children }: { children: ReactNode }) => children,
  useAnonymousSession: jest.fn(),
}));

// Only the provider is stubbed: the layout also mounts the personal-recording
// reconciliation, which reaches the package's MMKV helper through the collection.
jest.mock("@bnewapp/mobile-kit", () => ({
  ...jest.requireActual("@bnewapp/mobile-kit"),
  QueryProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

// jest-expo's SafeAreaProvider renders nothing until it measures insets, which
// never happens under the test renderer — pass children straight through.
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
}));

const mockedUseSession = useAnonymousSession as jest.Mock;
const retry = jest.fn();

it("renders no route until the anonymous identity exists", () => {
  mockedUseSession.mockReturnValue({ status: "pending", session: null, retry });
  render(<RootLayout />);

  expect(screen.queryByText("index")).toBeNull();
  expect(screen.queryByText("move/[moveId]/scan")).toBeNull();
});

it("offers a retry instead of hanging when the sign-in cannot complete", () => {
  mockedUseSession.mockReturnValue({ status: "unavailable", session: null, retry });
  render(<RootLayout />);

  expect(screen.getByLabelText("Try starting a session again")).toBeTruthy();
  expect(screen.queryByText("index")).toBeNull();
});

it("exposes the full route set once the session is ready", () => {
  mockedUseSession.mockReturnValue({ status: "ready", session: { user: { id: "anon" } }, retry });
  render(<RootLayout />);

  for (const name of [
    "index",
    "move/[moveId]/scan",
    "move/[moveId]/result",
    "profile/index",
    "profile/[moveId]",
    "profile/style/[styleId]",
  ]) {
    expect(screen.getByText(name)).toBeTruthy();
  }
});

// The tempo bar in the feed is a gesture consumer and nothing in the navigation
// stack mounts this root on our behalf.
it("mounts the gesture-handler root above every screen", () => {
  mockedUseSession.mockReturnValue({ status: "ready", session: { user: { id: "anon" } }, retry });
  render(<RootLayout />);

  expect(screen.UNSAFE_getByType(GestureHandlerRootView)).toBeTruthy();
});

it("mounts the developer menu in development builds", () => {
  mockedUseSession.mockReturnValue({ status: "ready", session: { user: { id: "anon" } }, retry });
  render(<RootLayout />);

  expect(screen.getByLabelText("Open developer menu")).toBeTruthy();
});
