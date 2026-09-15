import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useEffect } from "react";

/**
 * Correct the track only once it drifts further than this from the video. A smaller gap
 * is inaudible, and seeking on every tick makes the music stutter.
 */
const MAX_DRIFT_SECONDS = 0.15;
/**
 * How often the video reports its playhead. It is also the worst case delay before the
 * track starts, because the first correction happens on a tick.
 */
const SYNC_INTERVAL_SECONDS = 0.25;

interface ClockSubscription {
  remove(): void;
}

/**
 * Both players this hook drives are released by effects declared before it — the caller's
 * `useVideoPlayer` and the `useAudioPlayer` below — so on unmount they are already detached
 * from their native counterparts by the time this teardown runs, and touching one throws
 * `NativeSharedObjectNotFoundException`. A released player has already stopped and dropped
 * its listeners, so there is nothing left for us to undo.
 */
function unlessReleased(teardown: () => void): void {
  try {
    teardown();
  } catch {
    return;
  }
}

/**
 * The slice of `expo-video`'s player this hook drives. Structural like
 * `PlaybackController`, so the sync is testable without a native player.
 */
export interface SyncedVideoClock {
  readonly playing: boolean;
  readonly currentTime: number;
  timeUpdateEventInterval: number;
  addListener(
    event: "timeUpdate",
    listener: (payload: { currentTime: number }) => void,
  ): ClockSubscription;
  addListener(
    event: "playingChange",
    listener: (payload: { isPlaying: boolean }) => void,
  ): ClockSubscription;
  addListener(event: "playToEnd", listener: () => void): ClockSubscription;
}

export interface SyncedMusicTrackOptions {
  /** Null while the track is still unknown, and for a move that has no music. */
  audioUrl: string | null;
  /** Music playhead at the video's first frame, in milliseconds. */
  offsetMs: number;
}

/**
 * Plays a music track in time with a silent video. The Record screen captures no audio
 * (`enableAudio: false`), so the song has to be replayed beside the clip, seeked to the
 * playhead the dancer actually heard at the first frame.
 *
 * The video is the clock and every correction is derived from its playhead, so a track
 * that loads late, a loop wrap, and a pause from `useFocusedPlayback` all heal through
 * the same path rather than each needing their own signal.
 *
 * The hook owns the global silent-mode audio flag, so one screen must not mount it
 * twice: the first unmount would clear the flag out from under the other.
 */
export function useSyncedMusicTrack(
  player: SyncedVideoClock,
  { audioUrl, offsetMs }: SyncedMusicTrackOptions,
): void {
  const music = useAudioPlayer(audioUrl ?? undefined);

  useEffect(() => {
    if (audioUrl === null) return;
    void setAudioModeAsync({ playsInSilentMode: true });
    return () => {
      void setAudioModeAsync({ playsInSilentMode: false });
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioUrl === null) return;
    const offsetSeconds = offsetMs / 1_000;

    const sync = (videoTime: number, isPlaying: boolean) => {
      if (!music.isLoaded) return;
      const target = offsetSeconds + videoTime;
      if (Math.abs(music.currentTime - target) > MAX_DRIFT_SECONDS) void music.seekTo(target);
      if (isPlaying && !music.playing) music.play();
      else if (!isPlaying && music.playing) music.pause();
    };

    player.timeUpdateEventInterval = SYNC_INTERVAL_SECONDS;
    const subscriptions = [
      player.addListener("timeUpdate", ({ currentTime }) => sync(currentTime, player.playing)),
      player.addListener("playingChange", ({ isPlaying }) => sync(player.currentTime, isPlaying)),
      // The next tick would correct a wrap anyway; this only shortens the window in which
      // the previous lap's music is still audible.
      player.addListener("playToEnd", () => {
        if (music.isLoaded) void music.seekTo(offsetSeconds);
      }),
    ];
    sync(player.currentTime, player.playing);

    // Guarded separately: an already-released video player must not skip stopping the track.
    return () => {
      unlessReleased(() => {
        for (const subscription of subscriptions) subscription.remove();
        player.timeUpdateEventInterval = 0;
      });
      unlessReleased(() => music.pause());
    };
  }, [audioUrl, music, offsetMs, player]);
}
