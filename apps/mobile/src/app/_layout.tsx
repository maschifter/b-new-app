import "@/global.css";
import type { DevMenu as DevMenuComponent } from "@/features/dev-menu/dev-menu";
import { NativeAnimatedWarningGuard } from "@/lib/animation/native-animated-warning-guard";
import { AuthSessionProvider, useAuthSession } from "@/lib/auth/session-provider";
import { QueryProvider } from "@/lib/providers/query-provider";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

// `__DEV__ ? require(...) : null` is the Metro-safe shape: the bundler inlines
// `__DEV__` and constant-folds the whole expression, so the dev-menu module never
// enters a production bundle. The type-only import is erased and just keeps the
// binding checked against the real component.
const DevMenu: typeof DevMenuComponent | null = __DEV__
  ? require("@/features/dev-menu/dev-menu").DevMenu
  : null;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthSessionProvider>
          <NativeAnimatedWarningGuard />
          <RootNavigator />
          {DevMenu ? <DevMenu /> : null}
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
        <Stack.Screen name="dance" />
        <Stack.Screen name="dance/[moveId]" />
        <Stack.Screen name="dance/[moveId]/record" />
        <Stack.Screen name="room/[ownerId]" />
      </Stack.Protected>
    </Stack>
  );
}
