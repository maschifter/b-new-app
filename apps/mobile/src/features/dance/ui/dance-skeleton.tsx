import { View } from "react-native";

export function DanceSkeleton() {
  return (
    <View
      testID="dance-skeleton"
      className="flex-1 bg-app"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="gap-3 px-4 pb-1 pt-2">
        <View className="h-8 w-3/5 rounded bg-panel-raised" />
        <View className="flex-row gap-2">
          <View className="h-9 w-16 rounded-full bg-panel" />
          <View className="h-9 w-24 rounded-full bg-panel" />
          <View className="h-9 w-24 rounded-full bg-panel" />
        </View>
      </View>
      <View className="flex-1 items-center justify-center">
        <View className="h-[70%] w-[84%] rounded-[28px] bg-panel" />
      </View>
      <View className="flex-row gap-3 px-4 pb-2 pt-2">
        <View className="h-14 w-28 rounded-full bg-panel" />
        <View className="h-14 flex-1 rounded-full bg-panel-raised" />
      </View>
    </View>
  );
}
