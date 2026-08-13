import { View } from "react-native";

// Placeholder rows shown while the first page loads. Mirrors the row layout so
// the swap to real rows does not shift the scroll position.
export function ExploreSkeleton() {
  return (
    <View
      testID="explore-skeleton"
      className="gap-[10px] px-4 pt-3"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {SKELETON_KEYS.map((key) => (
        <View
          key={key}
          className="flex-row items-center gap-3 rounded-[14px] bg-panel px-[14px] py-3"
        >
          <View className="size-11 rounded-full bg-panel-raised" />
          <View className="flex-1 gap-[6px]">
            <View className="h-3 w-3/5 rounded bg-panel-raised" />
            <View className="h-3 w-[35%] rounded bg-panel-raised" />
          </View>
        </View>
      ))}
    </View>
  );
}

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"];
