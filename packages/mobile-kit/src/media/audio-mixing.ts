/**
 * The slice of `expo-video`'s player these helpers write. Structural like
 * `PlaybackController`, so `mobile-kit` takes no dependency on `expo-video`.
 */
export interface AudioSessionPlayer {
  audioMixingMode: "mixWithOthers" | "duckOthers" | "auto" | "doNotMix";
}

/**
 * On iOS the session is computed from the highest-priority mode among the players that are
 * *playing*, muted or not (`expo-video/ios/VideoManager.swift`, `findAudioMixingMode`), and a
 * player's own default is `doNotMix` (`ios/VideoPlayer.swift`) — the highest priority there is.
 * A silent preview therefore seizes the session and stops the user's own music, so every muted
 * player has to opt out of it explicitly.
 */
export function keepBackgroundAudio(player: AudioSessionPlayer): void {
  player.audioMixingMode = "mixWithOthers";
}

/**
 * For the two surfaces whose own soundtrack is the point. Same behaviour as the SDK 55 default,
 * written down because it is a product decision and the upstream default changes.
 */
export function takeOverBackgroundAudio(player: AudioSessionPlayer): void {
  player.audioMixingMode = "doNotMix";
}
