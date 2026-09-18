import { deletePersonalRecordingFile, personalRecordingUri } from "@/features/scan/recording-store";
import { type PersonalRecording, deletePersonalRecordingAtom } from "@/lib/collection";
import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { VideoView, useVideoPlayer } from "expo-video";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

interface ExportMessage {
  tone: "error" | "success";
  text: string;
}

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
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<ExportMessage | null>(null);

  const videoUri = personalRecordingUri(recording.fileName);
  const player = useVideoPlayer(videoUri, (created) => {
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

  /**
   * Both exports read the file and write nothing, so neither can leave the collection
   * half-changed: every failure below is a message over a recording that is still there.
   * One flag for both, because they share the one file and a second tap mid-export would
   * either save the clip twice or open a sheet behind the first one.
   */
  const download = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportMessage(null);
    try {
      // Asked at the tap and never at mount: a gallery prompt on a screen the user only
      // opened to watch a video is a prompt they have no reason to grant.
      const permission = await MediaLibrary.requestPermissionsAsync(true, ["video"]);
      if (!permission.granted) {
        setExportMessage({
          tone: "error",
          text: permission.canAskAgain
            ? "Stepz needs access to your gallery to save this video."
            : "Allow gallery access for Stepz in Settings, then tap Download again.",
        });
        return;
      }
      await MediaLibrary.saveToLibraryAsync(videoUri);
      setExportMessage({ tone: "success", text: "Saved to your gallery" });
    } catch {
      setExportMessage({ tone: "error", text: "Couldn't save to your gallery. Try again." });
    } finally {
      setIsExporting(false);
    }
  };

  const share = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportMessage(null);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setExportMessage({ tone: "error", text: "Sharing isn't available on this device." });
        return;
      }
      // A cancelled sheet resolves exactly like a completed one. Nothing here writes, so
      // the two outcomes are the same state and the difference does not have to be known.
      await Sharing.shareAsync(videoUri, {
        mimeType: "video/mp4",
        UTI: "public.mpeg-4",
        dialogTitle: "Share your dance",
      });
    } catch {
      setExportMessage({ tone: "error", text: "Couldn't share your video. Try again." });
    } finally {
      setIsExporting(false);
    }
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
      <View className="flex-row gap-3">
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Download my video"
          accessibilityState={{ disabled: isExporting }}
          disabled={isExporting}
          onPress={() => void download()}
          className="min-h-11 flex-1 items-center justify-center rounded-2xl bg-panel-raised px-4"
        >
          <Text className="font-bold text-base text-foreground">Download</Text>
        </BouncablePress>
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Share my video"
          accessibilityState={{ disabled: isExporting }}
          disabled={isExporting}
          onPress={() => void share()}
          className="min-h-11 flex-1 items-center justify-center rounded-2xl bg-panel-raised px-4"
        >
          <Text className="font-bold text-base text-foreground">Share</Text>
        </BouncablePress>
      </View>
      {exportMessage === null ? null : (
        <Text
          accessibilityLiveRegion="polite"
          className={exportMessage.tone === "error" ? "text-danger text-sm" : "text-copy text-sm"}
        >
          {exportMessage.text}
        </Text>
      )}
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
