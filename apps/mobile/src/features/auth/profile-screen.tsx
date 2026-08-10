import { BouncablePress } from "@/components/bouncable-press";
import { Screen } from "@/components/screen";
import { SignOutButton } from "@/components/sign-out-button";
import { useAuthSession } from "@/lib/auth/session-provider";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export function ProfileScreen() {
  const { session } = useAuthSession();
  const email = session?.user.email ?? "Unknown account";
  const initial = email.trim().charAt(0).toUpperCase() || "?";
  const createdAt = session?.user.created_at;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>PROFILE</Text>
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.close}
        >
          <Text style={styles.closeLabel}>Back</Text>
        </BouncablePress>
      </View>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLabel}>{initial}</Text>
        </View>
        <Text style={styles.email}>{email}</Text>
        {createdAt ? <Text style={styles.meta}>Member since {formatDate(createdAt)}</Text> : null}
      </View>

      <View style={styles.actions}>
        <SignOutButton />
      </View>
    </Screen>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eyebrow: { color: "#A78BFA", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  close: {
    borderColor: "#4A4856",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  closeLabel: { color: "#F8F7FC", fontSize: 14, fontWeight: "700" },
  identity: { alignItems: "center", gap: 12, marginTop: 48 },
  avatar: {
    alignItems: "center",
    backgroundColor: "#8B5CF6",
    borderRadius: 40,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  avatarLabel: { color: "#F8F7FC", fontSize: 34, fontWeight: "800" },
  email: { color: "#F8F7FC", fontSize: 20, fontWeight: "700" },
  meta: { color: "#898995", fontSize: 14 },
  actions: { marginTop: "auto" },
});
