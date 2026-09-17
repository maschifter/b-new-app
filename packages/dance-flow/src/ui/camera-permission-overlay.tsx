import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { BlurView } from "expo-blur";
import { Linking, StyleSheet, Text, View } from "react-native";

/**
 * The pre-prompt wording a consuming app may override. Every field defaults to the
 * string this package ships, so an app that passes nothing renders exactly as before.
 */
export interface CameraPermissionCopy {
  title?: string | undefined;
  body?: string | undefined;
  allowLabel?: string | undefined;
  dismissLabel?: string | undefined;
}

interface CameraPermissionOverlayProps extends CameraPermissionCopy {
  canRequestPermission: boolean;
  onRequest: () => Promise<boolean>;
  /** Omitted when the host screen has nowhere to go back to; the escape is then hidden. */
  onDismiss?: (() => void) | undefined;
}

export function CameraPermissionOverlay({
  canRequestPermission,
  onRequest,
  onDismiss,
  title = "Camera access is needed",
  body = "Allow camera access to record your dance attempt. Video capture never records microphone audio.",
  allowLabel = "Allow camera",
  dismissLabel = "Not now",
}: CameraPermissionOverlayProps) {
  return (
    <BlurView
      intensity={80}
      tint="dark"
      style={StyleSheet.absoluteFill}
      className="items-center justify-center px-8"
    >
      <Text
        accessibilityRole="header"
        className="text-center text-xl font-extrabold text-foreground"
      >
        {title}
      </Text>
      <Text className="mt-2 text-center text-sm leading-5 text-muted">{body}</Text>
      {canRequestPermission ? (
        <BouncablePress
          accessibilityRole="button"
          // Fixed rather than derived from `allowLabel`: this is the shipped label
          // both apps' tests read, and it still contains whatever visible text an
          // app injects for this button.
          accessibilityLabel="Allow camera access"
          onPress={() => void onRequest()}
          className="mt-5 rounded-2xl bg-primary px-5 py-3"
        >
          <Text className="font-bold text-foreground">{allowLabel}</Text>
        </BouncablePress>
      ) : (
        <View className="items-center">
          <Text className="mt-5 text-center text-sm text-muted">
            Enable camera access in Settings, then return here.
          </Text>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
            onPress={() => void Linking.openSettings()}
            className="mt-4 rounded-2xl bg-primary px-5 py-3"
          >
            <Text className="font-bold text-foreground">Open Settings</Text>
          </BouncablePress>
        </View>
      )}
      {onDismiss ? (
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel={canRequestPermission ? dismissLabel : "Cancel"}
          onPress={onDismiss}
          className="mt-4 px-5 py-2"
        >
          <Text className="text-sm font-bold text-copy">
            {canRequestPermission ? dismissLabel : "Cancel"}
          </Text>
        </BouncablePress>
      ) : null}
    </BlurView>
  );
}
