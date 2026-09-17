import { COLORS } from "@/lib/theme/colors";
import { StyleSheet, Text, View } from "react-native";

const RING_SIZE = 116;
const RING_STROKE = 10;

/**
 * The fill, computed apart from the view so the three boundaries can be tested without
 * a renderer.
 *
 * A square View with a full border radius draws its top border from 10:30 to 1:30 and
 * its right border from 1:30 to 4:30, so colouring those two gives a 180° arc that ends
 * at 3 o'clock when rotated by 45°. Each half of the ring is one such arc behind a mask
 * over its half of the circle, rotated so the arc *ends* where the fill should stop.
 */
export function ringHalfRotations(percent: number | null): { right: number; left: number } {
  const filled = percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
  const rightEnd = (Math.min(filled, 50) / 50) * 180;
  const leftEnd = (Math.max(filled - 50, 0) / 50) * 180;
  return { right: rightEnd - 135, left: leftEnd + 45 };
}

interface AverageScoreRingProps {
  /** `null` at zero learned moves, which reads `--` and leaves the ring empty. */
  percent: number | null;
}

export function AverageScoreRing({ percent }: AverageScoreRingProps) {
  const rotation = ringHalfRotations(percent);
  return (
    <View
      testID="average-score-ring"
      accessible
      accessibilityLabel={
        percent === null ? "Average Score, no scores yet" : `Average Score, ${percent} percent`
      }
      style={styles.ring}
      className="items-center justify-center"
    >
      <View style={[styles.track, { borderColor: COLORS.border }]} />
      <RingHalf side="right" rotation={rotation.right} />
      <RingHalf side="left" rotation={rotation.left} />
      <View className="items-center">
        <Text className="font-extrabold text-2xl text-foreground">
          {percent === null ? "--" : `${percent}%`}
        </Text>
        <Text className="text-muted text-xs">Average Score</Text>
      </View>
    </View>
  );
}

function RingHalf({ side, rotation }: { side: "left" | "right"; rotation: number }) {
  return (
    <View style={[styles.mask, side === "right" ? styles.maskRight : styles.maskLeft]}>
      <View
        style={[
          styles.arc,
          side === "right" ? styles.arcInRightMask : styles.arcInLeftMask,
          { borderTopColor: COLORS.neon, borderRightColor: COLORS.neon },
          { transform: [{ rotate: `${rotation}deg` }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { width: RING_SIZE, height: RING_SIZE },
  track: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
  },
  mask: {
    position: "absolute",
    top: 0,
    width: RING_SIZE / 2,
    height: RING_SIZE,
    overflow: "hidden",
  },
  maskRight: { left: RING_SIZE / 2 },
  maskLeft: { left: 0 },
  arc: {
    position: "absolute",
    top: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
    borderColor: "transparent",
  },
  arcInRightMask: { left: -RING_SIZE / 2 },
  arcInLeftMask: { left: 0 },
});
