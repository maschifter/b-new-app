import { renderAsync } from "@testing-library/react-native";
import { View } from "react-native";

import { useFocusedPlayback } from "../use-focused-playback";

const mockUseIsFocused = jest.fn(() => true);

jest.mock("@react-navigation/native", () => ({ useIsFocused: () => mockUseIsFocused() }));

const player = { play: jest.fn(), pause: jest.fn() };

function PlaybackFixture({ shouldPlay }: { shouldPlay: boolean }) {
  useFocusedPlayback(player, shouldPlay);
  return <View />;
}

beforeEach(() => {
  mockUseIsFocused.mockReturnValue(true);
  player.play.mockReset();
  player.pause.mockReset();
});

it("plays only when the route is focused and playback is requested", async () => {
  await renderAsync(<PlaybackFixture shouldPlay />);

  expect(player.play).toHaveBeenCalledTimes(1);
  expect(player.pause).not.toHaveBeenCalled();
});

it("pauses on blur without issuing another command during unmount", async () => {
  mockUseIsFocused.mockReturnValue(false);
  const screen = await renderAsync(<PlaybackFixture shouldPlay />);

  expect(player.pause).toHaveBeenCalledTimes(1);
  await screen.unmountAsync();
  expect(player.pause).toHaveBeenCalledTimes(1);
});
