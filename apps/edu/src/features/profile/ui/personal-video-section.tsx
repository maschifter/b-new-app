import { deletePersonalRecordingFile, personalRecordingUri } from "@/features/scan/recording-store";
import { type PersonalRecording, deletePersonalRecordingAtom } from "@/lib/collection";
import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { VideoView, useVideoPlayer } from "expo-video";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

interface PersonalVideoSectionProps {
  moveId: string;
  recording: PersonalRecording;
}

/**
 * My Video: the device-only clip the user chose to keep. It is never uploaded, and
 * deleting it never touches the learned move or its score.
 */
export function PersonalVideoSection({ moveId, recording }: PersonalVideoSectionProps) {
  const dropPointer = useSetAtom(deletePersonalRecordingAtom);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasDeleteFailed, setHasDeleteFailed] = useState(false);

  const player = useVideoPlayer(personalRecordingUri(recording.fileName), (created) => {
    created.loop = true;
  });
  useFocusedPlayback(player, isPlaying);

  /**
   * The order is fixed: the pointer goes first, because a pointer that outlives its file
   * is the one state that renders a broken video. `fileName` is read into a local before
   * the write, which is what removes the record this handler would otherwise read it from.
   */
  const deleteRecording = () => {
    const { fileName } = recording;
    setIsPlaying(false);
    if (!dropPointer(moveId)) {
      setHasDeleteFailed(true);
      return;
    }
    deletePersonalRecordingFile(fileName);
  };

  const confirmDelete = () => {
    Alert.alert("Delete this video?", "Your score for this move is kept.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: deleteRecording },
    ]);
  };

  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="font-extrabold text-foreground text-lg">
        My Video
      </Text>
      <View className="overflow-hidden rounded-2xl bg-panel">
        <VideoView
          testID="personal-video"
          player={player}
          nativeControls={false}
          contentFit="cover"
          style={styles.video}
        />
      </View>
      <View className="flex-row gap-3">
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause my video" : "Play my video"}
          onPress={() => setIsPlaying((playing) => !playing)}
          className="min-h-11 flex-1 items-center justify-center rounded-2xl bg-panel-raised px-4"
        >
          <Text className="font-bold text-base text-foreground">
            {isPlaying ? "Pause" : "Play"}
          </Text>
        </BouncablePress>
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Delete my video"
          onPress={confirmDelete}
          className="min-h-11 flex-1 items-center justify-center rounded-2xl border border-danger px-4"
        >
          <Text className="font-bold text-base text-danger">Delete Video</Text>
        </BouncablePress>
      </View>
      {hasDeleteFailed ? (
        <View className="gap-2">
          <Text accessibilityLiveRegion="polite" className="text-danger text-sm">
            Couldn't delete your video
          </Text>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Retry deleting my video"
            onPress={deleteRecording}
            className="min-h-11 self-start justify-center rounded-xl border border-border px-4"
          >
            <Text className="font-bold text-foreground text-sm">Retry</Text>
          </BouncablePress>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  video: { width: "100%", aspectRatio: 3 / 4 },
});
