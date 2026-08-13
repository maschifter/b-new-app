import { BouncablePress } from "@/components/bouncable-press";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function ExploreRoomShell({ children }: { children: ReactNode }) {
  return (
    <View style={styles.container}>
      {children}
      <ExploreRoomHeader />
    </View>
  );
}

export function ExploreRoomHeader({ username }: { username?: string }) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} pointerEvents="box-none" style={styles.overlay}>
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.back}
      >
        <Text style={styles.backLabel}>Back</Text>
      </BouncablePress>
      {username ? (
        <View style={styles.usernamePill}>
          <Text style={styles.username} numberOfLines={1}>
            {username}
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function ExploreRoomMessage({ title, copy }: { title: string; copy: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageCopy}>{copy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#17171D", flex: 1 },
  centered: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  overlay: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    left: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    position: "absolute",
    right: 0,
    top: 0,
  },
  back: {
    alignItems: "center",
    backgroundColor: "rgba(23,23,29,0.72)",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    minWidth: 44,
    paddingHorizontal: 14,
  },
  backLabel: { color: "#F8F7FC", fontSize: 14, fontWeight: "700" },
  usernamePill: {
    backgroundColor: "rgba(23,23,29,0.72)",
    borderRadius: 18,
    flexShrink: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  username: { color: "#F8F7FC", fontSize: 15, fontWeight: "700" },
  messageTitle: { color: "#F8F7FC", fontSize: 18, fontWeight: "700" },
  messageCopy: { color: "#898995", fontSize: 14, lineHeight: 20, textAlign: "center" },
});
