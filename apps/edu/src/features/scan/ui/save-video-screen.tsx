import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { Text, View } from "react-native";

interface SaveVideoScreenProps {
  moveTitle: string;
  isSaving: boolean;
  hasFailed: boolean;
  onSave: () => void;
  onSkip: () => void;
}

/**
 * Document 02 section 4's strings, verbatim. The privacy note is the one string in
 * this app that talks about a recording; it may not be reworded, and no new string
 * around it may state or imply that the clip stayed on the device.
 */
export function SaveVideoScreen({
  moveTitle,
  isSaving,
  hasFailed,
  onSave,
  onSkip,
}: SaveVideoScreenProps) {
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="font-extrabold text-2xl text-foreground">
        Nice work!
      </Text>
      <Text className="text-base text-copy">{moveTitle} is now in your collection.</Text>
      <Text className="font-bold text-base text-foreground">Save your recording too?</Text>
      <Text className="text-muted text-sm">
        Your personal video is private and optional. If you choose Not Now, the temporary recording
        will be deleted.
      </Text>
      {hasFailed ? (
        <Text accessibilityLiveRegion="polite" className="text-danger text-sm">
          Couldn't save your video. Your previous video is unchanged.
        </Text>
      ) : null}
      <View className="mt-1 flex-row gap-3">
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Not Now"
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={onSkip}
          className="flex-1 items-center rounded-2xl border border-border py-4"
        >
          <Text className="font-bold text-foreground">Not Now</Text>
        </BouncablePress>
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel={hasFailed ? "Retry saving your video" : "Save My Video"}
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={onSave}
          className="flex-1 items-center rounded-2xl bg-primary py-4"
        >
          <Text className="font-bold text-foreground">{hasFailed ? "Retry" : "Save My Video"}</Text>
        </BouncablePress>
      </View>
    </View>
  );
}
