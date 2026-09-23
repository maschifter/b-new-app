import "@/global.css";
import "@/lib/bootstrap/dance-flow";
import type { DevMenu as DevMenuComponent } from "@/features/dev-menu/dev-menu";
import { usePersonalRecordingReconciliation } from "@/features/scan/reconciliation";
import { AnonymousSessionProvider, useAnonymousSession } from "@/lib/auth/session-provider";
import { useGenresCache } from "@/lib/catalog";
import { COLORS } from "@/lib/theme/colors";
import { QueryProvider } from "@bnewapp/mobile-kit";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text, View } from "react-native";
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
  // The feed's tempo bar is a gesture consumer, and nothing in expo-router or
  // react-navigation mounts this root for us: without it a pan never activates on
  // Android.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <AnonymousSessionProvider>
            <RootNavigator />
            {DevMenu ? <DevMenu /> : null}
            <StatusBar style="light" />
          </AnonymousSessionProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { status } = useAnonymousSession();

  if (status === "pending") {
    return (
      <View className="flex-1 items-center justify-center bg-app">
        <ActivityIndicator color={COLORS.foreground} />
      </View>
    );
  }

  if (status === "unavailable") {
    return <SessionUnavailable />;
  }

  // Every route needs the anonymous identity, and nothing renders until it exists,
  // so no Stack.Protected group is required here.
  return (
    <>
      <PersonalRecordingReconciliation />
      <GenresCacheWriter />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="move/[moveId]/scan" />
        <Stack.Screen name="move/[moveId]/pro-tip" />
        <Stack.Screen name="move/[moveId]/result" options={{ gestureEnabled: false }} />
        <Stack.Screen name="profile/index" />
        <Stack.Screen name="profile/[moveId]" />
        <Stack.Screen name="profile/style/[styleId]" />
      </Stack>
    </>
  );
}

/**
 * Personal recordings are reconciled once per launch, below the session gate: a pointer
 * whose file is gone is dropped, and a file no pointer references is deleted.
 */
function PersonalRecordingReconciliation() {
  usePersonalRecordingReconciliation();
  return null;
}

/**
 * The style names are the one value on the profile that is not local, and this is the
 * app's only writer of their disk cache. It is mounted here rather than by the profile
 * so a session that only ever opened the feed still leaves the names behind.
 */
function GenresCacheWriter() {
  useGenresCache();
  return null;
}

function SessionUnavailable() {
  const { retry } = useAnonymousSession();
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-app px-8">
      <Text className="text-center font-semibold text-xl text-foreground">
        Couldn't start a session
      </Text>
      <Text className="text-center text-base text-copy">
        Stepz needs a one-time anonymous sign-in to score your moves. Check your connection and try
        again.
      </Text>
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel="Try starting a session again"
        className="mt-4 rounded-full bg-primary px-6 py-3"
        onPress={retry}
      >
        <Text className="font-semibold text-base text-foreground">Try again</Text>
      </BouncablePress>
    </View>
  );
}
