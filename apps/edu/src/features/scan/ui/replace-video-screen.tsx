import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { VideoView, useVideoPlayer } from "expo-video";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

interface ReplaceVideoScreenProps {
  existingVideoUri: string;
  newVideoUri: string;
  isSaving: boolean;
  hasFailed: boolean;
  onReplace: () => void;
  onKeepExisting: () => void;
}

/** The replacement decision keeps both recordings available until the user chooses. */
export function ReplaceVideoScreen({
  existingVideoUri,
  newVideoUri,
  isSaving,
  hasFailed,
  onReplace,
  onKeepExisting,
}: ReplaceVideoScreenProps) {
  const [playingVideo, setPlayingVideo] = useState<"existing" | "new" | null>(null);

  return (
    <View className="gap-4">
      <Text accessibilityRole="header" className="font-extrabold text-2xl text-foreground">
        Replace your saved video?
      </Text>
      <Text className="text-base text-copy">
        You can keep one personal video for each move. Saving this recording will permanently
        replace your previous video.
      </Text>
      <View className="flex-row gap-3">
        <VideoPreview
          label="Current"
          videoUri={existingVideoUri}
          isPlaying={playingVideo === "existing"}
          onToggle={() => setPlayingVideo((current) => (current === "existing" ? null : "existing"))}
        />
        <VideoPreview
          label="New"
          videoUri={newVideoUri}
          isPlaying={playingVideo === "new"}
          onToggle={() => setPlayingVideo((current) => (current === "new" ? null : "new"))}
        />
      </View>
      {hasFailed ? (
        <Text accessibilityLiveRegion="polite" className="text-danger text-sm">
          Couldn't save your video. Your previous video is unchanged.
        </Text>
      ) : null}
      <View className="gap-3">
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Keep Existing Video"
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={onKeepExisting}
          className="items-center rounded-2xl border border-border py-4"
        >
          <Text className="font-bold text-foreground">Keep Existing Video</Text>
        </BouncablePress>
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel={hasFailed ? "Retry replacing your video" : "Replace Video"}
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={onReplace}
          className="items-center rounded-2xl bg-danger py-4"
        >
          <Text className="font-bold text-foreground">{hasFailed ? "Retry" : "Replace Video"}</Text>
        </BouncablePress>
      </View>
    </View>
  );
}

interface VideoPreviewProps {
  label: "Current" | "New";
  videoUri: string;
  isPlaying: boolean;
  onToggle: () => void;
}

function VideoPreview({ label, videoUri, isPlaying, onToggle }: VideoPreviewProps) {
  const player = useVideoPlayer(videoUri, (created) => {
    created.loop = true;
    created.muted = true;
  });
  useFocusedPlayback(player, isPlaying);

  const videoName = label === "Current" ? "current saved video" : "new video";
  return (
    <View className="flex-1 gap-2">
      <Text className="font-bold text-foreground text-sm uppercase tracking-wide">{label}</Text>
      <View className="overflow-hidden rounded-2xl border border-border bg-panel-raised">
        <VideoView
          testID={`replace-${label.toLowerCase()}-video-preview`}
          player={player}
          nativeControls={false}
          contentFit="cover"
          style={styles.video}
        />
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? `Pause ${videoName}` : `Play ${videoName}`}
          onPress={onToggle}
          className="items-center border-t border-border bg-panel py-2"
        >
          <Text className="font-bold text-foreground text-sm">{isPlaying ? "Pause" : "Play"}</Text>
        </BouncablePress>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  video: { width: "100%", aspectRatio: 3 / 4 },
});
