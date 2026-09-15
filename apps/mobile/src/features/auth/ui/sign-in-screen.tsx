import { BouncablePress } from "@/components/bouncable-press";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { supabase } from "@/lib/auth/supabase";
import { COLORS } from "@/lib/theme/colors";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, View } from "react-native";

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
        className="flex-1"
      >
        <View className="flex-1 justify-center gap-8">
          <View className="gap-[10px]">
            <Text className="text-xs font-extrabold tracking-[1.5px] text-neon">BNEWAPP</Text>
            <Text className="text-[32px] font-bold tracking-[-0.5px] text-foreground">
              {isSignUp ? "Create your account" : "Welcome back"}
            </Text>
            <Text className="text-base leading-6 text-copy">
              {isSignUp
                ? "Start with an email and password."
                : "Sign in to continue your dance journey."}
            </Text>
          </View>

          <View className="gap-[18px]">
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
            <Text accessibilityRole="alert" className="text-sm leading-5 text-danger">
              {errorMessage}
            </Text>
          ) : null}
          {notice ? (
            <Text accessibilityRole="alert" className="text-sm leading-5 text-neon">
              {notice}
            </Text>
          ) : null}

          <View className="gap-3">
            <BouncablePress
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={submit}
              className={`min-h-[52px] flex-row items-center justify-center gap-2 rounded-xl bg-primary px-5 ${isSubmitting ? "opacity-[0.55]" : ""}`}
            >
              {isSubmitting ? <ActivityIndicator color={COLORS.foreground} /> : null}
              <Text className="text-base font-bold text-foreground">
                {isSignUp ? "Create account" : "Sign in"}
              </Text>
            </BouncablePress>
            <BouncablePress
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={switchMode}
              className={`min-h-[52px] flex-row items-center justify-center gap-2 rounded-xl border border-border px-5 ${isSubmitting ? "opacity-[0.55]" : ""}`}
            >
              <Text className="text-base font-bold text-foreground">
                {isSignUp ? "I already have an account" : "Create an account"}
              </Text>
            </BouncablePress>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
