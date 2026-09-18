import { LinearGradient } from "expo-linear-gradient";
import { View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

interface FeedSkeletonProps {
  /**
   * The real filter bar lives outside the pager's Suspense boundary, so the pager's own
   * fallback must not draw a second pair of chips underneath it. Only the outer fallback,
   * which renders before that bar exists, shows them.
   */
  showFilters?: boolean;
}

/**
 * The feed's loading shape, laid out on the same geometry the pager uses: a full-bleed
 * surface with the bottom gradient, the right-hand column, the tempo bar and the call to
 * action where they will actually appear. `DanceSkeleton` draws a header-and-button-row
 * card screen, so swapping it for the pager moved every control at once.
 */
export function FeedSkeleton({ showFilters = true }: FeedSkeletonProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="feed-skeleton"
      className="flex-1 bg-app"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="flex-1 bg-panel" />
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        locations={[0, 0.9]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: Math.round(height * 0.32),
        }}
      />
      {showFilters ? (
        <SafeAreaView edges={["top", "left", "right"]} className="absolute inset-x-0 top-0">
          <View className="flex-row gap-2 px-4 pt-2">
            <View className="h-9 w-28 rounded-full bg-panel-raised" />
            <View className="h-9 w-28 rounded-full bg-panel-raised" />
          </View>
        </SafeAreaView>
      ) : null}
      <View className="absolute top-16 right-3 size-12 rounded-full bg-panel-raised" />
      <View
        className="absolute right-3 w-11 rounded-full border border-border bg-black/40"
        style={{ bottom: insets.bottom + 150, height: Math.round(height * 0.36) }}
      />
      <View
        className="absolute inset-x-0 bottom-0 gap-3 px-5"
        style={{ paddingBottom: insets.bottom + 16 }}
      >
        <View className="h-8 w-3/5 rounded bg-panel-raised" />
        <View className="h-14 rounded-full bg-panel-raised" />
      </View>
    </View>
  );
}
