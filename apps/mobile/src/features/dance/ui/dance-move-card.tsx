import { BouncablePress } from "@/components/bouncable-press";
import { useFocusedPlayback } from "@/lib/media/use-focused-playback";
import type { DanceMove } from "@bnewapp/types";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import { StyleSheet, Text, View } from "react-native";

interface DanceMoveCardProps {
  move: DanceMove;
  selected: boolean;
  width: number;
  height: number;
  onPress: () => void;
}

function levelLabel(level: number): string {
  if (level >= 3) return "Hard";
  if (level >= 2) return "Medium";
  return "Easy";
}

export function DanceMoveCard({ move, selected, width, height, onPress }: DanceMoveCardProps) {
  const previewVideoUrl =
    move.mainVideoUrl ??
    move.proDancerVideoUrl ??
    move.presentationVideoUrl ??
    move.filmYourselfVideoUrl;
  const previewImageUrl = move.thumbnailUrl ?? move.proDancerImageUrl ?? move.dancerTipImageUrl;
  return (
    <BouncablePress
      accessibilityRole="button"
      accessibilityLabel={`Choose ${move.title}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ width, height }}
      className={`overflow-hidden rounded-[28px] border-2 bg-panel ${selected ? "border-neon" : "border-transparent"}`}
    >
      <View
        style={{ position: "absolute", top: 0, left: 0, width, height }}
        className="bg-panel-raised"
      >
        {previewVideoUrl ? (
          <DanceMoveVideoPreview url={previewVideoUrl} playing={selected} />
        ) : previewImageUrl ? (
          <Image source={previewImageUrl} contentFit="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-xs font-extrabold tracking-[3px] text-neon">
              DANCE MOVE
            </Text>
            <Text className="mt-2 text-center text-sm text-copy">Preview coming soon</Text>
          </View>
        )}
      </View>

      <View className="absolute inset-x-0 top-0 flex-row items-start justify-between px-5 pt-5">
        <View className="flex-row items-center gap-2 rounded-full bg-black/40 px-3 py-1.5">
          <LevelDots level={move.level} />
          <Text className="text-xs font-bold text-foreground">{levelLabel(move.level)}</Text>
        </View>
        {move.bpm ? (
          <View className="rounded-full bg-black/40 px-3 py-1.5">
            <Text className="text-xs font-bold text-foreground">{move.bpm} BPM</Text>
          </View>
        ) : null}
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={["transparent", "rgba(0,0,0,0.9)"]}
        locations={[0, 0.95]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: Math.round(height * 0.5),
        }}
      />
      <View pointerEvents="none" className="absolute inset-x-0 bottom-0 gap-1.5 px-5 pb-6">
        <Text className="text-3xl font-extrabold leading-9 text-foreground" numberOfLines={2}>
          {move.title}
        </Text>
        <Text className="text-sm leading-5 text-copy" numberOfLines={2}>
          {move.description ?? "Find your rhythm"}
        </Text>
      </View>
    </BouncablePress>
  );
}

function LevelDots({ level }: { level: number }) {
  return (
    <View className="flex-row items-center gap-1">
      {[1, 2, 3].map((dot) => (
        <View
          key={dot}
          className={`h-1.5 w-1.5 rounded-full ${dot <= level ? "bg-neon" : "bg-white/30"}`}
        />
      ))}
    </View>
  );
}

function DanceMoveVideoPreview({ url, playing }: { url: string; playing: boolean }) {
  const player = useVideoPlayer(url, (createdPlayer) => {
    createdPlayer.loop = true;
    createdPlayer.muted = true;
  });
  useFocusedPlayback(player, playing);

  return (
    <VideoView
      testID="dance-move-video-preview"
      player={player}
      nativeControls={false}
      contentFit="cover"
      style={StyleSheet.absoluteFill}
    />
  );
}
