import "@/global.css";
import { NativeAnimatedWarningGuard } from "@/lib/animation/native-animated-warning-guard";
import { AuthSessionProvider, useAuthSession } from "@/lib/auth/session-provider";
import { QueryProvider } from "@/lib/providers/query-provider";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthSessionProvider>
          <NativeAnimatedWarningGuard />
          <RootNavigator />
          <StatusBar style="light" />
        </AuthSessionProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { hydrated, session } = useAuthSession();

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={session === null}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
      <Stack.Protected guard={session !== null}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="shop" />
        <Stack.Screen name="room/[ownerId]" />
      </Stack.Protected>
    </Stack>
  );
}
