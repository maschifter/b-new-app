import RootLayout from "@/app/_layout";
import { useAuthSession } from "@/lib/auth/session-provider";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

// A Stack mock that honors Stack.Protected's guard and prints each screen name,
// so we can assert which routes the real layout exposes for a given session.
jest.mock("expo-router", () => {
  const React = require("react");
  const { Text } = require("react-native");
  const Stack = ({ children }: { children: ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  Stack.Screen = ({ name }: { name: string }) => React.createElement(Text, null, name);
  Stack.Protected = ({ guard, children }: { guard: boolean; children: ReactNode }) =>
    guard ? React.createElement(React.Fragment, null, children) : null;
  return { Stack };
});

jest.mock("@/lib/providers/query-provider", () => ({
  QueryProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("@/lib/auth/session-provider", () => ({
  AuthSessionProvider: ({ children }: { children: ReactNode }) => children,
  useAuthSession: jest.fn(),
}));

jest.mock("@/lib/animation/native-animated-warning-guard", () => ({
  NativeAnimatedWarningGuard: () => null,
}));

jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

// jest-expo's SafeAreaProvider renders nothing until it measures insets, which
// never happens under the test renderer — pass children straight through.
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
}));

const mockedUseAuth = useAuthSession as jest.Mock;

it("keeps the room route out of a signed-out deep link", () => {
  mockedUseAuth.mockReturnValue({ hydrated: true, session: null });
  render(<RootLayout />);

  expect(screen.queryByText("room/[ownerId]")).toBeNull();
  expect(screen.getByText("auth")).toBeTruthy();
});

it("exposes the room route only inside the authenticated stack", () => {
  mockedUseAuth.mockReturnValue({ hydrated: true, session: { user: { id: "u" } } });
  render(<RootLayout />);

  expect(screen.getByText("room/[ownerId]")).toBeTruthy();
  expect(screen.queryByText("auth")).toBeNull();
});
