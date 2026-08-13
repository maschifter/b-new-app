import { Screen } from "@/components/screen";
import { Text, View } from "react-native";

export function CrewScreen() {
  return (
    <Screen>
      <View className="flex-1 justify-center gap-2">
        <Text className="text-xs font-extrabold tracking-[1.5px] text-neon">CREW</Text>
        <Text className="text-[32px] font-bold tracking-[-0.5px] text-foreground">Your crew</Text>
        <Text className="text-base leading-6 text-copy">
          Follow dancers and see your crew here. Coming soon.
        </Text>
      </View>
    </Screen>
  );
}
