import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/** Returns the two masked half-ring rotations for a clockwise percentage fill. */
export function ringHalfRotations(percent: number | null): { right: number; left: number } {
  const filled = percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
  const rightEnd = (Math.min(filled, 50) / 50) * 180;
  const leftEnd = (Math.max(filled - 50, 0) / 50) * 180;
  return { right: rightEnd - 135, left: leftEnd + 45 };
}

interface ScoreRingProps {
  percent: number | null;
  size: number;
  strokeWidth: number;
  trackColor: string;
  fillColor: string;
  children: ReactNode;
  testID?: string | undefined;
  accessibilityLabel: string;
}

export function ScoreRing({
  percent,
  size,
  strokeWidth,
  trackColor,
  fillColor,
  children,
  testID,
  accessibilityLabel,
}: ScoreRingProps) {
  const rotation = ringHalfRotations(percent);
  const half = size / 2;
  const ringStyle = { width: size, height: size };
  const circleStyle = {
    width: size,
    height: size,
    borderRadius: half,
    borderWidth: strokeWidth,
  };

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel}
      style={ringStyle}
      className="items-center justify-center"
    >
      <View testID={testID ? `${testID}-track` : undefined} style={[styles.absolute, circleStyle, { borderColor: trackColor }]} />
      <RingHalf side="right" rotation={rotation.right} size={size} strokeWidth={strokeWidth} fillColor={fillColor} />
      <RingHalf side="left" rotation={rotation.left} size={size} strokeWidth={strokeWidth} fillColor={fillColor} />
      <View pointerEvents="none" accessible={false}>{children}</View>
    </View>
  );
}

function RingHalf({
  side,
  rotation,
  size,
  strokeWidth,
  fillColor,
}: {
  side: "left" | "right";
  rotation: number;
  size: number;
  strokeWidth: number;
  fillColor: string;
}) {
  const half = size / 2;
  return (
    <View style={[styles.mask, { width: half, height: size, left: side === "right" ? half : 0 }]}>
      <View
        style={[
          styles.arc,
          {
            width: size,
            height: size,
            borderRadius: half,
            borderWidth: strokeWidth,
            left: side === "right" ? -half : 0,
            borderTopColor: fillColor,
            borderRightColor: fillColor,
            transform: [{ rotate: `${rotation}deg` }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: { position: "absolute" },
  mask: { position: "absolute", top: 0, overflow: "hidden" },
  arc: { position: "absolute", top: 0, borderColor: "transparent" },
});
