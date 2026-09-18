import { mergeAudioOffsetMs } from "@bnewapp/dance-core";
import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { useSyncedMusicTrack } from "@bnewapp/mobile-kit/media/use-synced-music-track";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAtomValue } from "jotai";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { optionalDanceMoveAtomFamily } from "../_atoms/queries";
import { useDanceSubmission } from "../use-dance-submission";
import { SubmissionFeedback } from "./submission-feedback";

interface DanceResultScreenProps {
  moveId: string;
  clipPath: string;
  clipDuration: number;
  /** Music playhead at the first recorded frame; absent when the player never started. */
  clipAudioOffsetMs?: number | undefined;
  onRecordAgain: () => void;
  onDone: () => void;
}

/** Replays the captured clip while its upload and asynchronous score complete. */
export function DanceResultScreen({
  moveId,
  clipPath,
  clipDuration,
  clipAudioOffsetMs,
  onRecordAgain,
  onDone,
}: DanceResultScreenProps) {
  const player = useVideoPlayer(clipPath, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
  });
  useFocusedPlayback(player, true);
  // The clip is silent by design, so the move's track is replayed beside it. The measured
  // offset is what the dancer actually heard; older clips and a player that never started
  // fall back to the same computed timeline the merge worker uses.
  const move = useAtomValue(optionalDanceMoveAtomFamily(moveId)).data;
  const music = move?.music ?? null;
  useSyncedMusicTrack(player, {
    audioUrl: music?.audioUrl ?? null,
    offsetMs:
      clipAudioOffsetMs ??
      mergeAudioOffsetMs(move?.bpm ?? null, music?.delayBeforeAvatarDance ?? null),
  });
  const {
    submission,
    isTerminal: canFinish,
    retry: retrySubmission,
  } = useDanceSubmission({ moveId, clipPath, clipDuration, clipAudioOffsetMs });

  return (
    <SafeAreaView className="flex-1 bg-black" edges={["top", "right", "bottom", "left"]}>
      <View className="flex-1 bg-black">
        <VideoView player={player} contentFit="cover" nativeControls={false} style={styles.video} />
        <View className="gap-4 bg-app px-4 py-6">
          <Text accessibilityRole="header" className="text-2xl font-extrabold text-foreground">
            {submission.kind === "scored" ? "Your result" : "Reviewing your dance"}
          </Text>
          <SubmissionFeedback submission={submission} onRetry={retrySubmission} />
          {canFinish ? (
            <View className="flex-row gap-3">
              <BouncablePress
                accessibilityRole="button"
                accessibilityLabel="Record another dance"
                onPress={onRecordAgain}
                className="flex-1 items-center rounded-2xl border border-border py-4"
              >
                <Text className="font-bold text-foreground">Record again</Text>
              </BouncablePress>
              <BouncablePress
                accessibilityRole="button"
                accessibilityLabel="Finish dance result"
                onPress={onDone}
                className="flex-1 items-center rounded-2xl bg-primary py-4"
              >
                <Text className="font-bold text-foreground">Done</Text>
              </BouncablePress>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  video: { flex: 1 },
});
