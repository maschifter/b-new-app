import { COLORS } from "@bnewapp/mobile-kit/theme/colors";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { runOnJS, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, G } from "react-native-svg";

interface RecordingControlsProps {
  recordingLength: number;
  elapsedSeconds: number;
  isRecording: boolean;
  isBusy: boolean;
  isCameraUnavailable: boolean;
  hasBackAction: boolean;
  onBack: () => void;
  onStart: () => void;
  onStop: () => void;
  onProgressComplete: () => void;
}

export function RecordingControls({
  recordingLength,
  elapsedSeconds,
  isRecording,
  isBusy,
  isCameraUnavailable,
  hasBackAction,
  onBack,
  onStart,
  onStop,
  onProgressComplete,
}: RecordingControlsProps) {
  const sideAction = hasBackAction && !isRecording && !isBusy ? (
    <BouncablePress
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onBack}
      className="min-h-12 items-center justify-center px-2"
    >
      <Text className="text-center font-bold text-foreground">Back</Text>
    </BouncablePress>
  ) : null;

  return (
    <View testID="recording-controls" className="px-4">
      <View className="flex-row items-center justify-between">
        <View style={styles.sideAction}>{sideAction}</View>
        <RecordingProgressControl
          isRecording={isRecording}
          elapsedSeconds={elapsedSeconds}
          recordingLength={recordingLength}
          disabled={isCameraUnavailable || (!isRecording && isBusy)}
          onPress={isRecording ? onStop : onStart}
          onProgressComplete={onProgressComplete}
        />
        <View style={styles.sideAction} />
      </View>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const CONTROL_SIZE = 96;
const STROKE_WIDTH = 7;
const RADIUS = CONTROL_SIZE / 2 - STROKE_WIDTH / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function RecordingProgressControl({
  isRecording,
  elapsedSeconds,
  recordingLength,
  disabled,
  onPress,
  onProgressComplete,
}: {
  isRecording: boolean;
  elapsedSeconds: number;
  recordingLength: number;
  disabled: boolean;
  onPress: () => void;
  onProgressComplete: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const progressProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  useEffect(() => {
    if (!isRecording) {
      progress.value = 0;
      return;
    }
    if (reducedMotion) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: recordingLength * 1_000 }, (finished) => {
      if (finished) runOnJS(onProgressComplete)();
    });
  }, [isRecording, onProgressComplete, progress, recordingLength, reducedMotion]);

  useEffect(() => {
    if (isRecording && reducedMotion) {
      progress.value = Math.min(elapsedSeconds / recordingLength, 1);
    }
  }, [elapsedSeconds, isRecording, progress, recordingLength, reducedMotion]);

  return (
    <BouncablePress
      testID="recording-progress-control"
      accessibilityRole="button"
      accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
      accessibilityHint={isRecording ? "Stops and saves this take" : "Starts the dance count-in"}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.recordButton}
    >
      <Svg width={CONTROL_SIZE} height={CONTROL_SIZE} viewBox={`0 0 ${CONTROL_SIZE} ${CONTROL_SIZE}`} pointerEvents="none">
        <G rotation="-90" origin={`${CONTROL_SIZE / 2}, ${CONTROL_SIZE / 2}`}>
          <Circle cx="50%" cy="50%" r={CONTROL_SIZE / 2} fill="rgba(255,255,255,0.5)" />
          <Circle cx="50%" cy="50%" r={CONTROL_SIZE / 4} fill={COLORS.danger} />
          {isRecording ? (
            <AnimatedCircle
              cx="50%"
              cy="50%"
              r={RADIUS}
              stroke="white"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              animatedProps={progressProps}
              fill="transparent"
            />
          ) : null}
        </G>
      </Svg>
    </BouncablePress>
  );
}

const styles = StyleSheet.create({
  sideAction: { width: CONTROL_SIZE, minHeight: CONTROL_SIZE, justifyContent: "center" },
  recordButton: { width: CONTROL_SIZE, height: CONTROL_SIZE, alignItems: "center", justifyContent: "center" },
});
