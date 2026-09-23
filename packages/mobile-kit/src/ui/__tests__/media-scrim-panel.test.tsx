import { render, screen } from "@testing-library/react-native";
import { ScrollView, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MediaScrimPanel } from "../media-scrim-panel";

function renderPanel(bottomInset: number, bottomGap?: number, scrollable?: boolean) {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: 44, right: 0, bottom: bottomInset, left: 0 },
      }}
    >
      <MediaScrimPanel
        testID="scrim-content"
        className="gap-3 px-4 pt-14"
        {...(bottomGap === undefined ? {} : { bottomGap })}
        {...(scrollable === undefined ? {} : { scrollable })}
      >
        <Text>Start recording</Text>
      </MediaScrimPanel>
    </SafeAreaProvider>,
  );
}

it("holds its content above the system bar the media draws under", () => {
  renderPanel(48);

  expect(screen.getByText("Start recording")).toBeOnTheScreen();
  expect(screen.getByTestId("scrim-content")).toHaveStyle({ paddingBottom: 48 + 20 });
});

it("takes the gap a screen with taller controls asks for", () => {
  renderPanel(48, 24);

  expect(screen.getByTestId("scrim-content")).toHaveStyle({ paddingBottom: 48 + 24 });
});

it("makes an oversized decision panel scrollable", () => {
  renderPanel(48, undefined, true);

  expect(screen.UNSAFE_getByType(ScrollView)).toBeTruthy();
});
