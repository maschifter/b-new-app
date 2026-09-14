import { AppHeader } from "@/components/app-header";
import { Screen } from "@/components/screen";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { SignOutButton } from "./sign-out-button";

export function SettingsScreen() {
  return (
    <Screen>
      <AppHeader title="SETTINGS" onBack={() => router.back()} />

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
