import { resolvePreviewMedia } from "@bnewapp/dance-core";
import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import type { DanceMove } from "@bnewapp/types";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { playbackRateAtom } from "../_atoms/ui";

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

  return (
    <View style={{ width, height }} className="bg-app">
      {videoUrl && !failed ? (
        <FeedMoveVideo
          key={attempt}
          url={videoUrl}
          active={active}
          onFail={() => setFailed(true)}
        />
      ) : imageUrl ? (
        <Image source={imageUrl} contentFit="cover" style={StyleSheet.absoluteFill} />
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
  onFail,
}: {
  url: string;
  active: boolean;
  onFail: () => void;
}) {
  const rate = useAtomValue(playbackRateAtom);
  const player = useVideoPlayer(url, (createdPlayer) => {
    createdPlayer.loop = true;
    // Silence is a decision, not a default: a feed that autoplays audio on launch is
    // a product change. See the plan's section 4.1.
    createdPlayer.muted = true;
  });
  useFocusedPlayback(player, active);

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
      contentFit="cover"
      style={StyleSheet.absoluteFill}
    />
  );
}
