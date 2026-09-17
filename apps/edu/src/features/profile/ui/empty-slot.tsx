import { View } from "react-native";
import { CARD_ASPECT_RATIO } from "./learned-move-card";

interface EmptySlotProps {
  width: number;
}

/**
 * A style row keeps its shape before anything is learned in it. Outlined and hollow, so
 * it never reads as a skeleton: the skeleton is filled, and it means "still loading".
 */
export function EmptySlot({ width }: EmptySlotProps) {
  return (
    <View
      testID="profile-empty-slot"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width }}
      className="gap-2"
    >
      <View
        style={{ width, height: Math.round(width * CARD_ASPECT_RATIO) }}
        className="rounded-2xl border border-border border-dashed"
      />
    </View>
  );
}
