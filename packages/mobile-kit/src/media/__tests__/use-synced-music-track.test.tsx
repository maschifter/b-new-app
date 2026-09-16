import { renderAsync } from "@testing-library/react-native";
import { setAudioModeAsync } from "expo-audio";
import { View } from "react-native";

import { type SyncedVideoClock, useSyncedMusicTrack } from "../use-synced-music-track";

const mockMusic = {
  isLoaded: true,
  playing: false,
  currentTime: 0,
  seekTo: jest.fn((seconds: number) => {
    mockMusic.currentTime = seconds;
    return Promise.resolve();
  }),
  play: jest.fn(() => {
    mockMusic.playing = true;
  }),
  pause: jest.fn(() => {
    mockMusic.playing = false;
  }),
};

jest.mock("expo-audio", () => ({
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  useAudioPlayer: () => mockMusic,
}));

const mockedSetAudioModeAsync = setAudioModeAsync as jest.Mock;

type TimeUpdateListener = (payload: { currentTime: number }) => void;
type PlayingChangeListener = (payload: { isPlaying: boolean }) => void;
type PlayToEndListener = () => void;

/** Mirrors a released `SharedObject`, which throws on every native call afterwards. */
function detached(): Error {
  return new Error("Unable to find the native shared object associated with given JS object");
}

function createClock(initial: { playing: boolean; currentTime: number }) {
  const listeners: Record<string, unknown> = {};
  let removeCount = 0;
  let interval = 0;
  let released = false;
  const clock: SyncedVideoClock & { playing: boolean; currentTime: number } = {
    playing: initial.playing,
    currentTime: initial.currentTime,
    get timeUpdateEventInterval() {
      return interval;
    },
    set timeUpdateEventInterval(value: number) {
      if (released) throw detached();
      interval = value;
    },
    addListener(event: "timeUpdate" | "playingChange" | "playToEnd", listener: unknown) {
      listeners[event] = listener;
      return {
        remove: () => {
          if (released) throw detached();
          removeCount += 1;
        },
      };
    },
  };
  return {
    clock,
    release: () => {
      released = true;
    },
    get removeCount() {
      return removeCount;
    },
    get listenerCount() {
      return Object.keys(listeners).length;
    },
    emitTimeUpdate: (currentTime: number) =>
      (listeners.timeUpdate as TimeUpdateListener | undefined)?.({ currentTime }),
    emitPlayingChange: (isPlaying: boolean) =>
      (listeners.playingChange as PlayingChangeListener | undefined)?.({ isPlaying }),
    emitPlayToEnd: () => (listeners.playToEnd as PlayToEndListener | undefined)?.(),
  };
}

function TrackFixture({
  player,
  audioUrl,
  offsetMs,
}: {
  player: SyncedVideoClock;
  audioUrl: string | null;
  offsetMs: number;
}) {
  useSyncedMusicTrack(player, { audioUrl, offsetMs });
  return <View />;
}

beforeEach(() => {
  mockMusic.isLoaded = true;
  mockMusic.playing = false;
  mockMusic.currentTime = 0;
  mockMusic.seekTo.mockClear();
  mockMusic.play.mockClear();
  mockMusic.pause.mockClear();
  mockedSetAudioModeAsync.mockClear();
});

it("seeks the track to the measured offset and starts it with the video", async () => {
  const fake = createClock({ playing: true, currentTime: 0 });

  await renderAsync(
    <TrackFixture player={fake.clock} audioUrl="https://cdn.test/track.mp3" offsetMs={12_000} />,
  );

  expect(mockMusic.seekTo).toHaveBeenCalledWith(12);
  expect(mockMusic.play).toHaveBeenCalledTimes(1);
  expect(fake.clock.timeUpdateEventInterval).toBeGreaterThan(0);
  expect(mockedSetAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true });
});

it("re-seeks only once the track drifts past the tolerance", async () => {
  const fake = createClock({ playing: true, currentTime: 0 });
  await renderAsync(
    <TrackFixture player={fake.clock} audioUrl="https://cdn.test/track.mp3" offsetMs={12_000} />,
  );
  mockMusic.seekTo.mockClear();

  fake.clock.currentTime = 1;
  mockMusic.currentTime = 13.1;
  fake.emitTimeUpdate(1);
  expect(mockMusic.seekTo).not.toHaveBeenCalled();

  mockMusic.currentTime = 13.5;
  fake.emitTimeUpdate(1);
  expect(mockMusic.seekTo).toHaveBeenCalledWith(13);
});

it("returns the track to the offset when the clip loops", async () => {
  const fake = createClock({ playing: true, currentTime: 0 });
  await renderAsync(
    <TrackFixture player={fake.clock} audioUrl="https://cdn.test/track.mp3" offsetMs={12_000} />,
  );
  mockMusic.seekTo.mockClear();

  fake.emitPlayToEnd();

  expect(mockMusic.seekTo).toHaveBeenCalledWith(12);
});

it("pauses the track when the video stops, and resumes it when the video does", async () => {
  const fake = createClock({ playing: true, currentTime: 0 });
  await renderAsync(
    <TrackFixture player={fake.clock} audioUrl="https://cdn.test/track.mp3" offsetMs={12_000} />,
  );
  mockMusic.play.mockClear();

  fake.emitPlayingChange(false);
  expect(mockMusic.pause).toHaveBeenCalledTimes(1);

  fake.emitPlayingChange(true);
  expect(mockMusic.play).toHaveBeenCalledTimes(1);
});

it("starts a track that finishes loading after the video does", async () => {
  mockMusic.isLoaded = false;
  const fake = createClock({ playing: true, currentTime: 0 });
  await renderAsync(
    <TrackFixture player={fake.clock} audioUrl="https://cdn.test/track.mp3" offsetMs={12_000} />,
  );
  expect(mockMusic.play).not.toHaveBeenCalled();

  mockMusic.isLoaded = true;
  fake.clock.currentTime = 0.5;
  fake.emitTimeUpdate(0.5);

  expect(mockMusic.seekTo).toHaveBeenCalledWith(12.5);
  expect(mockMusic.play).toHaveBeenCalledTimes(1);
});

it("stops the track and releases the video listeners on unmount", async () => {
  const fake = createClock({ playing: true, currentTime: 0 });
  const screen = await renderAsync(
    <TrackFixture player={fake.clock} audioUrl="https://cdn.test/track.mp3" offsetMs={12_000} />,
  );

  await screen.unmountAsync();

  expect(mockMusic.pause).toHaveBeenCalled();
  expect(fake.removeCount).toBe(fake.listenerCount);
  expect(fake.clock.timeUpdateEventInterval).toBe(0);
  expect(mockedSetAudioModeAsync).toHaveBeenLastCalledWith({ playsInSilentMode: false });
});

it("stays inert for a move with no music", async () => {
  const fake = createClock({ playing: true, currentTime: 0 });

  await renderAsync(<TrackFixture player={fake.clock} audioUrl={null} offsetMs={12_000} />);

  expect(fake.listenerCount).toBe(0);
  expect(mockMusic.seekTo).not.toHaveBeenCalled();
  expect(mockMusic.play).not.toHaveBeenCalled();
  expect(mockedSetAudioModeAsync).not.toHaveBeenCalled();
});

it("tears down after expo has already released the video player", async () => {
  const fake = createClock({ playing: true, currentTime: 0 });
  const screen = await renderAsync(
    <TrackFixture player={fake.clock} audioUrl="https://cdn.test/track.mp3" offsetMs={12_000} />,
  );

  // expo-video releases the player from an effect declared before this hook's, so the
  // teardown always runs against a detached object on unmount.
  fake.release();
  await screen.unmountAsync();

  expect(mockMusic.pause).toHaveBeenCalled();
});

it("tears down after expo has already released the audio player", async () => {
  const fake = createClock({ playing: true, currentTime: 0 });
  const screen = await renderAsync(
    <TrackFixture player={fake.clock} audioUrl="https://cdn.test/track.mp3" offsetMs={12_000} />,
  );
  mockMusic.pause.mockImplementationOnce(() => {
    throw detached();
  });

  await screen.unmountAsync();

  expect(fake.clock.timeUpdateEventInterval).toBe(0);
});
