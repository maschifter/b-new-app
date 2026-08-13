import { supabase } from "@/lib/auth/supabase";
import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { BouncablePress } from "./bouncable-press";

export function SignOutButton() {
  // Query-cache cleanup is owned by AuthSessionProvider, which reacts to the
  // resulting SIGNED_OUT event — so explicit sign-out, session expiry, and
  // account replacement all follow the same cleanup path.
  const signOut = async () => {
    await supabase?.auth.signOut();
    router.replace("/auth/sign-in");
  };

  return (
    <BouncablePress accessibilityRole="button" onPress={signOut} style={styles.button}>
      <Text style={styles.label}>Sign out</Text>
    </BouncablePress>
  );
}

const styles = StyleSheet.create({
  button: {
    borderColor: "#4A4856",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  label: { color: "#F8F7FC", fontSize: 14, fontWeight: "700" },
});
