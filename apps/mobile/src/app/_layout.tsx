import "@/global.css";
import "@/lib/bootstrap/dance-flow";
import type { DevMenu as DevMenuComponent } from "@/features/dev-menu/dev-menu";
import { NativeAnimatedWarningGuard } from "@/lib/animation/native-animated-warning-guard";
import { AuthSessionProvider, useAuthSession } from "@/lib/auth/session-provider";
import { QueryProvider } from "@bnewapp/mobile-kit";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

// `__DEV__ ? require(...) : null` is the Metro-safe shape: the bundler inlines
// `__DEV__` and constant-folds the whole expression, so the dev-menu module never
// enters a production bundle. The type-only import is erased and just keeps the
// binding checked against the real component.
const DevMenu: typeof DevMenuComponent | null = __DEV__
  ? require("@/features/dev-menu/dev-menu").DevMenu
  : null;

export default function RootLayout() {
  // The lesson tempo bar is a gesture consumer, and nothing in expo-router or
  // react-navigation mounts this root for us: without it a pan never activates on
  // Android.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
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
        <Stack.Screen name="settings" />
        <Stack.Screen name="shop" />
        <Stack.Screen name="dance" />
        <Stack.Screen name="dance/post/[postId]" />
        <Stack.Screen name="dance/[moveId]" />
        <Stack.Screen name="dance/[moveId]/record" />
        <Stack.Screen name="dance/[moveId]/result" options={{ gestureEnabled: false }} />
        <Stack.Screen name="room/[ownerId]" />
      </Stack.Protected>
    </Stack>
  );
}
