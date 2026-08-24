import { View } from "react-native";

export function ShopSkeleton() {
  return (
    <View
      testID="shop-skeleton"
      className="flex-1 bg-app px-4 pt-3"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="mb-5 h-12 rounded-2xl bg-panel" />
      <View className="flex-row flex-wrap gap-3">
        {SKELETON_KEYS.map((key) => (
          <View key={key} className="h-64 w-[48%] rounded-2xl bg-panel" />
        ))}
      </View>
    </View>
  );
}

const SKELETON_KEYS = ["a", "b", "c", "d"];
