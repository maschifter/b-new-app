import { BouncablePress } from "@/components/bouncable-press";
import { ActivityIndicator, Text, View } from "react-native";

export function ExploreListFooter() {
  return (
    <View testID="explore-footer" className="py-5">
      <ActivityIndicator color="#8B5CF6" />
    </View>
  );
}

export function ExplorePaginationError({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="items-center gap-2 py-5">
      <Text className="text-center text-sm leading-5 text-muted">Couldn't load more studios.</Text>
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel="Retry loading more studios"
        onPress={onRetry}
        className="rounded-[10px] border border-border px-[18px] py-[10px]"
      >
        <Text className="text-sm font-bold text-foreground">Retry</Text>
      </BouncablePress>
    </View>
  );
}
