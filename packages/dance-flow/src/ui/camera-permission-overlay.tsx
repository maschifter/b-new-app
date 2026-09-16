import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { BlurView } from "expo-blur";
import { StyleSheet, Text } from "react-native";

interface CameraPermissionOverlayProps {
  canRequestPermission: boolean;
  onRequest: () => Promise<boolean>;
}

export function CameraPermissionOverlay({
  canRequestPermission,
  onRequest,
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
        Camera access is needed
      </Text>
      <Text className="mt-2 text-center text-sm leading-5 text-muted">
        Allow camera access to record your dance attempt. Video capture never records microphone
        audio.
      </Text>
      {canRequestPermission ? (
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Allow camera access"
          onPress={() => void onRequest()}
          className="mt-5 rounded-2xl bg-primary px-5 py-3"
        >
          <Text className="font-bold text-foreground">Allow camera</Text>
        </BouncablePress>
      ) : (
        <Text className="mt-5 text-center text-sm text-muted">
          Enable camera access in Settings, then return here.
        </Text>
      )}
    </BlurView>
  );
}
