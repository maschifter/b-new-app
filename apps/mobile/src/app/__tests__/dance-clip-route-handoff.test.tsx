import DanceRecordRoute from "@/app/dance/[moveId]/record";
import DanceResultRoute from "@/app/dance/[moveId]/result";
import type { RecordedDanceClip } from "@/features/dance";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Redirect: ({ href }: { href: string }) => React.createElement(Text, null, `redirect:${href}`),
    router: { back: jest.fn(), dismissTo: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: jest.fn(),
  };
});

jest.mock("@/features/dance", () => {
  const React = require("react");
  const { Text } = require("react-native");
  // The clip helpers stay real — driving the actual encode and decode is the point of
  // this test. Only the two screens are stood in for.
  return {
    ...require("@bnewapp/dance-flow/clip-params"),
    RecordDanceScreen: ({
      onRecordingComplete,
    }: {
      onRecordingComplete: (clip: RecordedDanceClip) => void;
    }) =>
      React.createElement(
        Text,
        {
          accessibilityRole: "button",
          onPress: () => onRecordingComplete(mockPendingClip),
        },
        "finish",
      ),
    // `?? "absent"` rather than an `in` check: the route now forwards the parsed
    // offset as a prop that is explicitly `undefined` when the clip never measured one.
    DanceResultScreen: (props: { clipAudioOffsetMs?: number | undefined }) =>
      React.createElement(Text, null, `offset:${props.clipAudioOffsetMs ?? "absent"}`),
  };
});

const mockedSearchParams = useLocalSearchParams as jest.Mock;
const mockedReplace = router.replace as jest.Mock;
const MOVE_ID = "00000000-0000-4000-8000-000000000001";
const CLIP_PATH = "file:///tmp/dance-attempt.mp4";

let mockPendingClip: RecordedDanceClip = { path: CLIP_PATH, duration: 12.4 };

/**
 * Drives the real hop the clip takes: the record route serializes it into router params
 * and the result route reconstructs it. A falsy check anywhere along the way would turn a
 * measured 0 into "never measured" and silently move the music to the top of the track.
 */
function handOff(clip: RecordedDanceClip) {
  mockPendingClip = clip;
  mockedSearchParams.mockReturnValue({ moveId: MOVE_ID });
  render(<DanceRecordRoute />);
  fireEvent.press(screen.getByText("finish"));

  const { params } = mockedReplace.mock.calls.at(-1)?.[0] ?? {};
  screen.unmount();
  mockedSearchParams.mockReturnValue(params);
  render(<DanceResultRoute />);
  return params as Record<string, string>;
}

beforeEach(() => {
  mockedReplace.mockReset();
  mockedSearchParams.mockReset();
});

it.each([
  ["a measured offset", 12_346],
  ["a measured zero", 0],
])("preserves %s across the record to result hand-off", (_label, audioOffsetMs) => {
  const params = handOff({ path: CLIP_PATH, duration: 12.4, audioOffsetMs });

  expect(params.clipAudioOffsetMs).toBe(String(audioOffsetMs));
  expect(screen.getByText(`offset:${audioOffsetMs}`)).toBeOnTheScreen();
});

it("passes no offset param at all when the clip never measured one", () => {
  const params = handOff({ path: CLIP_PATH, duration: 12.4 });

  expect(params).not.toHaveProperty("clipAudioOffsetMs");
  expect(screen.getByText("offset:absent")).toBeOnTheScreen();
});

it.each(["", "not-a-number", "-1"])(
  "treats an unusable offset param as absent rather than as a seek: %p",
  (clipAudioOffsetMs) => {
    mockedSearchParams.mockReturnValue({
      moveId: MOVE_ID,
      clipPath: CLIP_PATH,
      clipDuration: "12.4",
      clipAudioOffsetMs,
    });

    render(<DanceResultRoute />);

    expect(screen.getByText("offset:absent")).toBeOnTheScreen();
  },
);
