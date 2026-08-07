import { supabase } from "@/lib/auth/supabase";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator } from "react-native";
import { Screen } from "../../components/screen";

export default function AuthCallbackScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    if (!supabase || !code) return;
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!error) router.replace("/home");
    });
  }, [code]);

  return (
    <Screen>
      <ActivityIndicator color="#FFFFFF" />
    </Screen>
  );
}
