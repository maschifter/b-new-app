import { supabase } from "@/lib/auth/supabase";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Button, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../components/screen";

export default function AuthCallbackScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setErrorMessage("Supabase credentials are not configured.");
      return;
    }
    if (!code) {
      setErrorMessage("This sign-in link is missing a valid authorization code.");
      return;
    }

    let active = true;
    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!active) return;
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      router.replace("/home");
    });

    return () => {
      active = false;
    };
  }, [code]);

  if (errorMessage) {
    return (
      <Screen>
        <View style={styles.content}>
          <Text style={styles.title}>Sign-in unavailable</Text>
          <Text style={styles.copy}>{errorMessage}</Text>
          <Button title="Back to sign-in" onPress={() => router.replace("/auth/sign-in")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ActivityIndicator color="#FFFFFF" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: "center", gap: 16 },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "700" },
  copy: { color: "#C7C7D1", fontSize: 16, lineHeight: 24 },
});
