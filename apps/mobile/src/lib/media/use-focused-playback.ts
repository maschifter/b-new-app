import { useIsFocused } from "@react-navigation/native";
import { useEffect } from "react";

export interface PlaybackController {
  play(): void;
  pause(): void;
}

/** Runs playback only while its route is focused; hook-owned players dispose on unmount. */
export function useFocusedPlayback(player: PlaybackController, shouldPlay: boolean) {
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused && shouldPlay) player.play();
    else player.pause();
  }, [isFocused, player, shouldPlay]);
}
