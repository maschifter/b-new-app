import { BouncablePress } from "@/components/bouncable-press";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

interface EconomyHeaderProps {
  title: string;
  glow: number;
  onBack?: () => void;
  action?: { label: string; onPress: () => void };
}

export function EconomyHeader({ title, glow, onBack, action }: EconomyHeaderProps) {
  return (
    <View className="flex-row items-center justify-between gap-3 px-4 pb-3 pt-2">
      <View className="flex-row items-center gap-2">
        {onBack ? (
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            className="size-11 items-center justify-center rounded-full border border-border bg-panel"
          >
            <Ionicons name="chevron-back" size={22} color="#F8F7FC" />
          </BouncablePress>
        ) : null}
        <Text accessibilityRole="header" className="text-2xl font-black text-foreground">
          {title}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <View
          accessible
          accessibilityLabel={`${glow.toLocaleString()} Glow`}
          className="flex-row items-center gap-2 rounded-full border border-neon/40 bg-neon/10 px-4 py-2"
        >
          <Text className="text-base">✨</Text>
          <Text className="font-extrabold text-foreground">{glow.toLocaleString()}</Text>
        </View>
        {action ? (
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            className="rounded-full bg-primary px-4 py-3"
          >
            <Text className="text-sm font-extrabold text-foreground">{action.label}</Text>
          </BouncablePress>
        ) : null}
      </View>
    </View>
  );
}
