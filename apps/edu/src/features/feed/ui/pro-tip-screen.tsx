import { COLORS } from "@/lib/theme/colors";
import { danceMoveDetailAtomFamily } from "@bnewapp/dance-flow/atoms";
import { keepBackgroundAudio } from "@bnewapp/mobile-kit/media/audio-mixing";
import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { BouncablePress, MobileQueryErrorBoundary } from "@bnewapp/mobile-kit/ui";
import { TEMPO_BAR_HEIGHT, TempoBar } from "@bnewapp/mobile-kit/ui/tempo-bar";
import type { DanceMove } from "@bnewapp/types";
import { Image } from "expo-image";
import { type VideoPlayerStatus, VideoView, useVideoPlayer } from "expo-video";
import { useAtomValue } from "jotai";
import { Suspense, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function hasProTip(move: DanceMove): boolean {
  return move.dancerTipVideoUrl !== null || move.dancerTipImageUrl !== null;
}

/** A stack screen so Pro Tip owns its player and back navigation, like Boogiz. */
export function ProTipScreen({ moveId, onBack }: { moveId: string; onBack: () => void }) {
  // Close sits above the boundary so the loading, error and no-tip states are all
  // escapable from the screen itself, not only through the platform back gesture.
  return (
    <View testID="feed-pro-tip" className="flex-1 bg-black">
      <MobileQueryErrorBoundary title="Couldn't load this Pro Tip" retryLabel="Retry">
        <Suspense fallback={<ProTipLoading />}>
          <ProTipContent moveId={moveId} />
        </Suspense>
      </MobileQueryErrorBoundary>
      <CloseProTip onPress={onBack} />
    </View>
  );
}

function ProTipContent({ moveId }: { moveId: string }) {
  const move = useAtomValue(danceMoveDetailAtomFamily(moveId)).data;
  if (!hasProTip(move)) return <NoProTip />;
  return <ProTipMedia move={move} />;
}

function ProTipMedia({ move }: { move: DanceMove }) {
  const [rate, setRate] = useState(1);
  const videoUrl = move.dancerTipVideoUrl;

  return (
    <View className="flex-1">
      {videoUrl ? (
        <ProTipVideo url={videoUrl} rate={rate} />
      ) : move.dancerTipImageUrl ? (
        <Image source={move.dancerTipImageUrl} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : null}
      {/* The rate reaches the player and nothing else, so a still tip is given no
          control it cannot honour. */}
      {videoUrl ? (
        <View
          testID="feed-pro-tip-tempo"
          pointerEvents="box-none"
          className="absolute right-3"
          style={{ top: "50%", transform: [{ translateY: -TEMPO_BAR_HEIGHT / 2 }] }}
        >
          <TempoBar rate={rate} onRateChange={setRate} iconColor={COLORS.primary} />
        </View>
      ) : null}
    </View>
  );
}

function hasSettled(status: VideoPlayerStatus | undefined): boolean {
  return status === "readyToPlay" || status === "error";
}

export function ProTipVideo({ url, rate }: { url: string; rate: number }) {
  const player = useVideoPlayer(url, (createdPlayer) => {
    createdPlayer.loop = true;
    createdPlayer.muted = true;
    keepBackgroundAudio(createdPlayer);
  });
  const [loading, setLoading] = useState(true);
  useFocusedPlayback(player, true);

  useEffect(() => {
    player.playbackRate = rate;
  }, [player, rate]);

  useEffect(() => {
    // A cached clip can reach `readyToPlay` before this subscribes, and the missed
    // event would leave the spinner over a playing video for the rest of the screen.
    if (hasSettled(player.status)) setLoading(false);
    const subscription = player.addListener("statusChange", ({ status }) => {
      if (hasSettled(status)) setLoading(false);
    });
    return () => subscription.remove();
  }, [player]);

  return (
    <>
      <VideoView
        testID="feed-pro-tip-video"
        player={player}
        nativeControls={false}
        surfaceType="textureView"
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      {loading ? (
        <View
          testID="feed-pro-tip-video-loading"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          className="items-center justify-center bg-black/30"
        >
          <ActivityIndicator accessibilityLabel="Loading Pro Tip video" color={COLORS.foreground} />
        </View>
      ) : null}
    </>
  );
}

function CloseProTip({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center"
      style={{ bottom: insets.bottom + 8 }}
    >
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel="Close Pro Tip"
        onPress={onPress}
        className="flex-row items-center rounded-full bg-foreground px-9 py-3"
      >
        <Text className="font-bold text-primary text-base">Close</Text>
      </BouncablePress>
    </View>
  );
}

function ProTipLoading() {
  return (
    <View className="flex-1 items-center justify-center bg-black">
      <ActivityIndicator color={COLORS.foreground} />
    </View>
  );
}

function NoProTip() {
  return (
    <View className="flex-1 items-center justify-center bg-app px-8">
      <Text className="text-center text-base text-copy">
        No Pro Tip is available for this move.
      </Text>
    </View>
  );
}
