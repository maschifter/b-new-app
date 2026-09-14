import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { BouncablePress } from "./bouncable-press";

interface AppHeaderProps {
  title: string;
  onBack: () => void;
  trailing?: ReactNode;
}

export function AppHeader({ title, onBack, trailing }: AppHeaderProps) {
  return (
    <View className="flex-row items-center justify-between">
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        className="size-11 items-center justify-center rounded-full border border-border bg-panel"
      >
        <Ionicons name="chevron-back" size={22} color="#F8F7FC" />
      </BouncablePress>
      <Text
        accessibilityRole="header"
        className="text-xs font-extrabold tracking-[1.5px] text-neon"
      >
        {title}
      </Text>
      {trailing ? (
        <View className="size-11 items-center justify-center">{trailing}</View>
      ) : (
        <View className="size-11" />
      )}
    </View>
  );
}
