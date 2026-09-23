import { COLORS } from "@/lib/theme/colors";
import { resolvePreviewMedia } from "@bnewapp/dance-core";
import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import type { DanceMove } from "@bnewapp/types";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { feedPausedAtom, playbackRateAtom } from "../_atoms/ui";

interface FeedMovePageProps {
  move: DanceMove;
  active: boolean;
  width: number;
  height: number;
}

/** One full-screen page of the feed: the move's video, and nothing else. */
export function FeedMovePage({ move, active, width, height }: FeedMovePageProps) {
  const { videoUrl, imageUrl } = resolvePreviewMedia(move);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useAtom(feedPausedAtom);
  const playable = Boolean(videoUrl) && !failed;

  return (
    <View style={{ width, height }} className="bg-app">
      {videoUrl && !failed ? (
        <FeedMoveVideo
          key={attempt}
          url={videoUrl}
          active={active}
          paused={paused}
          onFail={() => setFailed(true)}
        />
      ) : imageUrl ? (
        <Image source={imageUrl} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : null}
      {/* Only the page that plays carries the toggle, so a neighbour held in the pager's
          window leaves no live touch target behind the one on the screen. The glyph is
          the only thing it draws, which keeps the central area free while playing
          (document 01 lines 62-63). */}
      {playable && active ? (
        <Pressable
          testID="feed-playback-toggle"
          accessibilityRole="button"
          accessibilityLabel={paused ? `Play ${move.title}` : `Pause ${move.title}`}
          onPress={() => setPaused((current) => !current)}
          style={StyleSheet.absoluteFill}
          className="items-center justify-center"
        >
          {paused ? (
            <View
              pointerEvents="none"
              className="size-20 items-center justify-center rounded-full bg-black/50"
            >
              <Ionicons name="play" size={40} color={COLORS.foreground} />
            </View>
          ) : null}
        </Pressable>
      ) : null}
      {failed ? (
        <View className="flex-1 items-center justify-center gap-3 px-10">
          <Text className="text-center text-base text-copy">This video didn't load.</Text>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel={`Retry ${move.title}`}
            // Only this item's player is rebuilt, so the current filters, position
            // and speed are untouched (document 01 line 107).
            onPress={() => {
              setFailed(false);
              setAttempt((current) => current + 1);
            }}
            className="rounded-full border border-border bg-panel px-6 py-3"
          >
            <Text className="font-bold text-base text-foreground">Retry</Text>
          </BouncablePress>
        </View>
      ) : null}
    </View>
  );
}

function FeedMoveVideo({
  url,
  active,
  paused,
  onFail,
}: {
  url: string;
  active: boolean;
  paused: boolean;
  onFail: () => void;
}) {
  const rate = useAtomValue(playbackRateAtom);
  const player = useVideoPlayer(url, (createdPlayer) => {
    createdPlayer.loop = true;
    // Silence is a decision, not a default: a feed that autoplays audio on launch is
    // a product change. See the plan's section 4.1.
    createdPlayer.muted = true;
  });
  useFocusedPlayback(player, active && !paused);

  useEffect(() => {
    if (active) player.playbackRate = rate;
  }, [active, player, rate]);

  useEffect(() => {
    const subscription = player.addListener("statusChange", ({ status }) => {
      if (status === "error") onFail();
    });
    return () => subscription.remove();
  }, [player, onFail]);

  return (
    <VideoView
      testID="feed-move-video"
      player={player}
      nativeControls={false}
      // A stack push renders the incoming screen over this one for the length of the
      // transition, and Android's default SurfaceView is composited below the window,
      // so it neither follows the animation nor stays beneath the screen sliding over
      // it. A TextureView draws inside the view hierarchy instead.
      surfaceType="textureView"
      contentFit="cover"
      style={StyleSheet.absoluteFill}
    />
  );
}
