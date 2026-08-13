import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Placeholder shown while a visited room loads. The real room is a full-bleed
// themed stage (StudioStage) with the same header overlay; the skeleton mirrors
// that framing — a full-screen stage surface plus the back / username shells —
// so the swap to the real room does not shift anything.
export function ExploreRoomSkeleton() {
  return (
    <View
      testID="explore-room-skeleton"
      className="flex-1 bg-panel"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="absolute inset-0 bg-panel-raised" />
      <SafeAreaView
        edges={["top", "left", "right"]}
        className="absolute inset-x-0 top-0 flex-row items-center gap-3 px-4 pt-2"
      >
        <View className="size-11 rounded-full bg-panel-muted" />
        <View className="h-[34px] w-[120px] rounded-[18px] bg-panel-muted" />
      </SafeAreaView>
    </View>
  );
}
