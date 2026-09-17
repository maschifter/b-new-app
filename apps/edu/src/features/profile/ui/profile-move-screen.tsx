import { learnedMovesAtom, personalRecordingsAtom } from "@/lib/collection";
import { COLORS } from "@/lib/theme/colors";
import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PersonalVideoSection } from "./personal-video-section";

interface ProfileMoveScreenProps {
  moveId: string;
  onBack: () => void;
}

/**
 * The learned move as it was captured: title, thumbnail, level and official video come
 * from the snapshot, so a move the catalog has since renamed or unpublished still opens.
 * Nothing on this screen fetches a move.
 */
export function ProfileMoveScreen({ moveId, onBack }: ProfileMoveScreenProps) {
  const learned = useAtomValue(learnedMovesAtom)[moveId];
  const recording = useAtomValue(personalRecordingsAtom)[moveId];
  const insets = useSafeAreaInsets();

  if (learned === undefined) {
    return (
      <SafeAreaView className="flex-1 bg-app" edges={["top", "left", "right", "bottom"]}>
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text accessibilityRole="header" className="font-extrabold text-foreground text-xl">
            Not in your collection
          </Text>
          <Text className="text-center text-base text-copy">
            This move isn't saved on this device.
          </Text>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Back to profile"
            onPress={onBack}
            className="mt-2 min-h-11 justify-center rounded-full bg-primary px-6"
          >
            <Text className="font-bold text-base text-foreground">Back to profile</Text>
          </BouncablePress>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-app" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <OfficialVideo url={learned.move.videoUrl} onBack={onBack} />
        <View className="gap-5 px-4 py-5">
          <View className="gap-1">
            <Text accessibilityRole="header" className="font-extrabold text-2xl text-foreground">
              {learned.move.title}
            </Text>
            <Text className="text-base text-copy">
              Your score: <Text className="font-extrabold text-neon">{learned.savedScore}</Text> /
              100
            </Text>
          </View>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel={`Scan Again, ${learned.move.title}`}
            onPress={() => router.push(`/move/${moveId}/scan`)}
            className="min-h-11 items-center justify-center rounded-2xl bg-primary py-4"
          >
            <Text className="font-bold text-base text-foreground">Scan Again</Text>
          </BouncablePress>
          {recording === undefined ? null : (
            <PersonalVideoSection moveId={moveId} recording={recording} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Playback stops on blur through `useFocusedPlayback`; backgrounding is `expo-video`'s
 * own `staysActiveInBackground`, left at its `false` default rather than managed here.
 */
function OfficialVideo({ url, onBack }: { url: string; onBack: () => void }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const player = useVideoPlayer(url, (created) => {
    created.loop = true;
  });
  useFocusedPlayback(player, isPlaying);

  return (
    <View className="bg-black">
      <VideoView
        testID="official-video"
        player={player}
        nativeControls={false}
        contentFit="cover"
        style={styles.video}
      />
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View className="flex-row items-center justify-between p-3">
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Back to profile"
            onPress={onBack}
            className="size-11 items-center justify-center rounded-full bg-black/60"
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.foreground} />
          </BouncablePress>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause the move video" : "Play the move video"}
            onPress={() => setIsPlaying((playing) => !playing)}
            className="size-11 items-center justify-center rounded-full bg-black/60"
          >
            <Ionicons name={isPlaying ? "pause" : "play"} size={22} color={COLORS.foreground} />
          </BouncablePress>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  video: { width: "100%", aspectRatio: 3 / 4 },
});
