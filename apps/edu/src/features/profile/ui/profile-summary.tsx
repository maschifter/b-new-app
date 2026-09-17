import { averageScorePercentAtom, learnedCountAtom } from "@/lib/collection";
import { useAtomValue } from "jotai";
import { Text, View } from "react-native";
import { AverageScoreRing } from "./average-score-ring";

/**
 * Both tiles are local and synchronous, so this never has a loading state. There is no
 * denominator anywhere: this app has no catalog total to divide by.
 */
export function ProfileSummary() {
  const percent = useAtomValue(averageScorePercentAtom);
  const count = useAtomValue(learnedCountAtom);
  const countLabel = `${count} ${count === 1 ? "move" : "moves"} learned`;

  return (
    <View className="flex-row gap-3 px-4 pb-5">
      <View className="flex-1 items-center rounded-3xl bg-panel p-4">
        <AverageScoreRing percent={percent} />
      </View>
      <View
        accessible
        accessibilityLabel={countLabel}
        className="flex-1 items-center justify-center gap-1 rounded-3xl bg-panel p-4"
      >
        <Text className="font-extrabold text-5xl text-neon">{count}</Text>
        <Text className="text-base text-copy">
          {count === 1 ? "move learned" : "moves learned"}
        </Text>
      </View>
    </View>
  );
}
