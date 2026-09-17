import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { Text, View } from "react-native";

interface ReplaceVideoScreenProps {
  isSaving: boolean;
  hasFailed: boolean;
  onReplace: () => void;
  onKeepExisting: () => void;
}

/** Document 02 section 5's strings, verbatim. */
export function ReplaceVideoScreen({
  isSaving,
  hasFailed,
  onReplace,
  onKeepExisting,
}: ReplaceVideoScreenProps) {
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="font-extrabold text-2xl text-foreground">
        Do you want to replace your video?
      </Text>
      <Text className="text-base text-copy">
        You can keep one personal video for each move. Saving this recording will permanently
        replace your previous video.
      </Text>
      {hasFailed ? (
        <Text accessibilityLiveRegion="polite" className="text-danger text-sm">
          Couldn't save your video. Your previous video is unchanged.
        </Text>
      ) : null}
      <View className="mt-1 flex-row gap-3">
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Keep Existing Video"
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={onKeepExisting}
          className="flex-1 items-center rounded-2xl border border-border py-4"
        >
          <Text className="font-bold text-foreground">Keep Existing Video</Text>
        </BouncablePress>
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel={hasFailed ? "Retry replacing your video" : "Replace Video"}
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={onReplace}
          className="flex-1 items-center rounded-2xl bg-danger py-4"
        >
          <Text className="font-bold text-foreground">{hasFailed ? "Retry" : "Replace Video"}</Text>
        </BouncablePress>
      </View>
    </View>
  );
}
