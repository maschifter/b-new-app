import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import type { DanceMove } from "@bnewapp/types";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function hasProTip(move: DanceMove): boolean {
  return move.dancerTipVideoUrl !== null || move.dancerTipImageUrl !== null;
}

/**
 * An in-screen overlay rather than a pushed route: the pager stays mounted, so
 * closing restores the same position, filters and speed (document 01 line 55).
 */
export function ProTipOverlay({ move, onClose }: { move: DanceMove; onClose: () => void }) {
  return (
    <View testID="feed-pro-tip" style={StyleSheet.absoluteFill} className="bg-app/95">
      <SafeAreaView edges={["top", "bottom"]} className="flex-1 px-5 pb-5">
        <View className="flex-row items-center justify-between py-3">
          <Text accessibilityRole="header" className="font-display text-foreground text-lg">
            Pro Tip
          </Text>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Close Pro Tip"
            onPress={onClose}
            className="rounded-full border border-border bg-panel px-4 py-2"
          >
            <Text className="font-bold text-copy text-sm">Close</Text>
          </BouncablePress>
        </View>
        <LinearGradient colors={[RUNTIME_COLORS["primary-wash"], RUNTIME_COLORS["primary-wash"]]} className="flex-1 rounded-3xl p-0.5">
          <View className="flex-1 overflow-hidden rounded-[14px] bg-panel">
          {move.dancerTipVideoUrl ? (
            <ProTipVideo url={move.dancerTipVideoUrl} />
          ) : move.dancerTipImageUrl ? (
            <Image
              source={move.dancerTipImageUrl}
              contentFit="cover"
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          </View>
        </LinearGradient>
        <Text className="mt-4 text-base text-copy">{move.description ?? move.title}</Text>
      </SafeAreaView>
    </View>
  );
}

function ProTipVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (createdPlayer) => {
    createdPlayer.loop = true;
    createdPlayer.muted = true;
  });
  useFocusedPlayback(player, true);

  return (
    <VideoView
      testID="feed-pro-tip-video"
      player={player}
      nativeControls={false}
      contentFit="contain"
      style={StyleSheet.absoluteFill}
    />
  );
}
import { RUNTIME_COLORS } from "@/lib/theme/colors";
