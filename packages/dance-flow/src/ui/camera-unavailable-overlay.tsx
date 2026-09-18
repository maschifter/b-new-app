import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { BlurView } from "expo-blur";
import { StyleSheet, Text } from "react-native";

interface CameraUnavailableOverlayProps {
  onRetry: () => void;
  /** Omitted when the host screen has nowhere to go back to; the escape is then hidden. */
  onDismiss?: (() => void) | undefined;
}

/**
 * The camera is permitted, but its session would not start — no camera on this device,
 * or another app holding the one there is. Separate from the permission overlay because
 * there is nothing for the user to grant: the actions are a retry and a way out.
 */
export function CameraUnavailableOverlay({ onRetry, onDismiss }: CameraUnavailableOverlayProps) {
  return (
    <BlurView
      testID="camera-unavailable"
      intensity={80}
      tint="dark"
      style={StyleSheet.absoluteFill}
      className="items-center justify-center px-8"
    >
      <Text
        accessibilityRole="header"
        className="text-center text-xl font-extrabold text-foreground"
      >
        Camera unavailable
      </Text>
      <Text className="mt-2 text-center text-sm leading-5 text-muted">
        This device's camera could not be started. Close any other app that might be using it, then
        try again.
      </Text>
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel="Try the camera again"
        onPress={onRetry}
        className="mt-5 rounded-2xl bg-primary px-5 py-3"
      >
        <Text className="font-bold text-foreground">Try again</Text>
      </BouncablePress>
      {onDismiss ? (
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onDismiss}
          className="mt-4 px-5 py-2"
        >
          <Text className="text-sm font-bold text-copy">Cancel</Text>
        </BouncablePress>
      ) : null}
    </BlurView>
  );
}
