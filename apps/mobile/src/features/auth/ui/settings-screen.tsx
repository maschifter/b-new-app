import { BouncablePress } from "@/components/bouncable-press";
import { Screen } from "@/components/screen";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { SignOutButton } from "./sign-out-button";

export function SettingsScreen() {
  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          className="size-11 items-center justify-center rounded-full border border-border bg-panel"
        >
          <Ionicons name="chevron-back" size={22} color="#F8F7FC" />
        </BouncablePress>
        <Text
          accessibilityRole="header"
          className="text-xs font-extrabold tracking-[1.5px] text-neon"
        >
          SETTINGS
        </Text>
        <View className="size-11" />
      </View>

      <View className="mt-12 gap-3">
        <Text className="text-2xl font-extrabold text-foreground">Account</Text>
        <Text className="text-base leading-6 text-copy">Manage your session on this device.</Text>
      </View>

      <View className="mt-auto">
        <SignOutButton />
      </View>
    </Screen>
  );
}
