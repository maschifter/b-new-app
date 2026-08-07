import { BouncablePress } from "@/components/bouncable-press";
import { Screen } from "@/components/screen";
import { getCurrentUser } from "@/lib/api/client";
import { useAuthSession } from "@/lib/auth/session-provider";
import { supabase } from "@/lib/auth/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  const { session } = useAuthSession();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: () => {
      if (!session) throw new Error("No active session");
      return getCurrentUser(session.access_token);
    },
    enabled: session !== null,
  });

  const signOut = async () => {
    await supabase?.auth.signOut();
    queryClient.clear();
    router.replace("/auth/sign-in");
  };

  return (
    <Screen>
      <View style={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>SIGNED IN</Text>
          <Text style={styles.title}>Dance</Text>
          {profileQuery.isPending ? <Text style={styles.copy}>Loading your profile…</Text> : null}
          {profileQuery.data ? <Text style={styles.copy}>{profileQuery.data.email}</Text> : null}
          {profileQuery.isError ? (
            <Text style={styles.error}>
              Your session works, but the profile API is unavailable.
            </Text>
          ) : null}
        </View>
        <Text style={styles.caption}>
          This screen verifies the authenticated mobile → API → database path.
        </Text>
        <BouncablePress accessibilityRole="button" onPress={signOut} style={styles.signOutButton}>
          <Text style={styles.signOutButtonLabel}>Sign out</Text>
        </BouncablePress>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: "center", gap: 32 },
  heading: { gap: 8 },
  eyebrow: { color: "#D9FF72", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#F8F7FC", fontSize: 40, fontWeight: "700", letterSpacing: -0.6 },
  copy: { color: "#C7C7D1", fontSize: 16 },
  caption: { color: "#898995", fontSize: 14, lineHeight: 20 },
  error: { color: "#FFBE8F", fontSize: 14, lineHeight: 20 },
  signOutButton: {
    alignItems: "center",
    borderColor: "#4A4856",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  signOutButtonLabel: { color: "#F8F7FC", fontSize: 16, fontWeight: "700" },
});
