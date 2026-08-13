import { Text, View } from "react-native";

export function ExploreEmpty() {
  return (
    <View className="items-center gap-2 px-8 py-16">
      <Text className="text-lg font-bold text-foreground">No studios yet</Text>
      <Text className="text-center text-sm leading-5 text-muted">
        Once other dancers decorate their rooms, they'll show up here to explore.
      </Text>
    </View>
  );
}
