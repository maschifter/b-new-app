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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
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
      </Stack.Protected>
    </Stack>
  );
}
