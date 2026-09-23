import { ScoreRing, ringHalfRotations } from "@/features/score";
import { COLORS } from "@/lib/theme/colors";
import { Text, View } from "react-native";

// Kept as a compatibility export while profile's focused test moves to the score feature.
export { ringHalfRotations };

interface AverageScoreRingProps {
  /** `null` at zero learned moves, which reads `--` and leaves the ring empty. */
  percent: number | null;
}

export function AverageScoreRing({ percent }: AverageScoreRingProps) {
  return (
    <ScoreRing
      testID="average-score-ring"
      percent={percent}
      size={116}
      strokeWidth={10}
      trackColor={COLORS.border}
      fillColor={COLORS.accent}
      accessibilityLabel={percent === null ? "Average Score, no scores yet" : `Average Score, ${percent} percent`}
    >
      <View className="items-center">
        <Text className="font-extrabold text-2xl text-foreground">
          {percent === null ? "--" : `${percent}%`}
        </Text>
        <Text className="text-muted text-xs">Average Score</Text>
      </View>
    </ScoreRing>
  );
}
