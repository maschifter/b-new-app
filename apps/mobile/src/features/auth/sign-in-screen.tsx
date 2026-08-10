import { BouncablePress } from "@/components/bouncable-press";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { supabase } from "@/lib/auth/supabase";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

type AuthMode = "sign-in" | "sign-up";

export function SignInScreen() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignUp = mode === "sign-up";

  const switchMode = () => {
    setMode((currentMode) => (currentMode === "sign-in" ? "sign-up" : "sign-in"));
    setErrorMessage(null);
    setNotice(null);
  };

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setErrorMessage(null);
    setNotice(null);

    if (!normalizedEmail.includes("@")) {
      setErrorMessage("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("Password must contain at least 8 characters.");
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    if (!supabase) {
      setErrorMessage("Add Supabase public credentials to enable sign-in.");
      return;
    }

    setIsSubmitting(true);
    const result = isSignUp
      ? await supabase.auth.signUp({ email: normalizedEmail, password })
      : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    setIsSubmitting(false);

    if (result.error) {
      setErrorMessage(result.error.message);
      return;
    }
    if (result.data.session) {
      router.replace("/studio");
      return;
    }
    if (isSignUp && !result.data.session) {
      setNotice("Check your email to confirm your account, then sign in.");
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>BNEWAPP</Text>
            <Text style={styles.title}>{isSignUp ? "Create your account" : "Welcome back"}</Text>
            <Text style={styles.copy}>
              {isSignUp
                ? "Start with an email and password."
                : "Sign in to continue your dance journey."}
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              label="Email"
              onChangeText={setEmail}
              placeholder="you@example.com"
              textContentType="emailAddress"
              value={email}
            />
            <TextField
              autoComplete={isSignUp ? "new-password" : "password"}
              label="Password"
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              textContentType={isSignUp ? "newPassword" : "password"}
              value={password}
            />
            {isSignUp ? (
              <TextField
                autoComplete="new-password"
                label="Confirm password"
                onChangeText={setConfirmPassword}
                placeholder="Repeat your password"
                secureTextEntry
                textContentType="newPassword"
                value={confirmPassword}
              />
            ) : null}
          </View>

          {errorMessage ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorMessage}
            </Text>
          ) : null}
          {notice ? (
            <Text accessibilityRole="alert" style={styles.notice}>
              {notice}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <BouncablePress
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={submit}
              style={[styles.button, styles.primaryButton, isSubmitting && styles.disabledButton]}
            >
              {isSubmitting ? <ActivityIndicator color="#F8F7FC" /> : null}
              <Text style={styles.primaryButtonLabel}>
                {isSignUp ? "Create account" : "Sign in"}
              </Text>
            </BouncablePress>
            <BouncablePress
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={switchMode}
              style={[styles.button, styles.secondaryButton, isSubmitting && styles.disabledButton]}
            >
              <Text style={styles.secondaryButtonLabel}>
                {isSignUp ? "I already have an account" : "Create an account"}
              </Text>
            </BouncablePress>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  content: { flex: 1, gap: 32, justifyContent: "center" },
  heading: { gap: 10 },
  eyebrow: { color: "#A78BFA", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#F8F7FC", fontSize: 32, fontWeight: "700", letterSpacing: -0.5 },
  copy: { color: "#C7C7D1", fontSize: 16, lineHeight: 24 },
  form: { gap: 18 },
  actions: { gap: 12 },
  button: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  primaryButton: { backgroundColor: "#8B5CF6" },
  primaryButtonLabel: { color: "#F8F7FC", fontSize: 16, fontWeight: "700" },
  secondaryButton: { borderColor: "#4A4856", borderWidth: 1 },
  secondaryButtonLabel: { color: "#F8F7FC", fontSize: 16, fontWeight: "700" },
  disabledButton: { opacity: 0.55 },
  error: { color: "#FF8F8F", fontSize: 14, lineHeight: 20 },
  notice: { color: "#A78BFA", fontSize: 14, lineHeight: 20 },
});
