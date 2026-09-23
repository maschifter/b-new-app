import { Text, View } from "react-native";
import Animated, { FadeOut, ZoomIn } from "react-native-reanimated";

interface RecordingCountdownProps {
  label: string | null;
  reducedMotion: boolean;
}

/** A short visual count-in; the parent remains the single owner of beat timing. */
export function RecordingCountdown({ label, reducedMotion }: RecordingCountdownProps) {
  if (label === null) return null;

  return (
    <View
      testID="recording-countdown"
      pointerEvents="none"
      className="absolute inset-0 items-center justify-center bg-black/20"
    >
      <Animated.View
        key={label}
        {...(reducedMotion ? {} : { entering: ZoomIn.duration(180), exiting: FadeOut.duration(120) })}
      >
        <Text accessibilityLiveRegion="polite" className="text-8xl font-black text-foreground">
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}
