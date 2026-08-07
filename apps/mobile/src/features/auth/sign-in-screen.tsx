import { supabase } from "@/lib/auth/supabase";
import { isUiPreviewEnabled } from "@/lib/auth/ui-preview";
import { makeRedirectUri } from "expo-auth-session";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Button, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "../../components/screen";

export function SignInScreen() {
  const [email, setEmail] = useState("");
  const redirectTo = makeRedirectUri({ scheme: "bnewapp", path: "auth/callback" });

  const completeSession = async (url: string) => {
    if (!supabase) return;
    const code = new URL(url).searchParams.get("code");
    if (!code) return;
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) Alert.alert("Sign-in unavailable", error.message);
    else router.replace("/home");
  };

  const sendEmailLink = async () => {
    if (!supabase) {
      Alert.alert("Setup needed", "Add Supabase public credentials to enable sign-in.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) Alert.alert("Sign-in unavailable", error.message);
    else Alert.alert("Check your email", "Open the sign-in link on this device to continue.");
  };

  const startGoogleSignIn = async () => {
    if (!supabase) {
      Alert.alert("Setup needed", "Add Supabase public credentials to enable sign-in.");
      return;
    }
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (result.error || !result.data.url) {
      Alert.alert("Sign-in unavailable", result.error?.message ?? "No sign-in URL was returned.");
      return;
    }
    const response = await WebBrowser.openAuthSessionAsync(result.data.url, redirectTo);
    if (response.type === "success") await completeSession(response.url);
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.copy}>Sign-in will be available when the Supabase project is connected.</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor="#898995"
          style={styles.input}
          value={email}
        />
        <Button title="Continue with email" onPress={sendEmailLink} />
        <Button title="Continue with Google" onPress={startGoogleSignIn} />
        {isUiPreviewEnabled ? <Button title="Preview home" onPress={() => router.replace("/home")} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: "center", gap: 16 },
  title: { color: "#FFFFFF", fontSize: 32, fontWeight: "700" },
  copy: { color: "#C7C7D1", fontSize: 16, lineHeight: 24 },
  input: { borderColor: "#50505B", borderWidth: 1, borderRadius: 8, color: "#FFFFFF", padding: 12 },
});
