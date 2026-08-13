import { BouncablePress } from "@/components/bouncable-press";
import { StudioStage } from "@/features/studio";
import { ROOM_TEMPLATE, templateById } from "@bnewapp/studio-core";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { exploreRoomQueryAtomFamily } from "../_atoms/queries";

// Read-only view of another dancer's room. The query is scoped to the signed-in
// viewer's cache; this screen owns its loading / not-found / error states and
// never touches MMKV (visited rooms are pure server data).
export function ExploreRoomScreen({ ownerId }: { ownerId: string }) {
  const {
    data: room,
    isPending,
    isError,
    refetch,
  } = useAtomValue(exploreRoomQueryAtomFamily(ownerId));

  if (isPending) {
    return (
      <Shell>
        <View style={styles.centered}>
          <ActivityIndicator color="#8B5CF6" />
        </View>
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <Message title="Couldn't load this studio" copy="Something went wrong. Please try again.">
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Retry loading this studio"
            onPress={() => refetch()}
            style={styles.retry}
          >
            <Text style={styles.retryLabel}>Retry</Text>
          </BouncablePress>
        </Message>
      </Shell>
    );
  }

  if (!room) {
    return (
      <Shell>
        <Message title="Studio not found" copy="This dancer hasn't set up a room yet." />
      </Shell>
    );
  }

  const template = templateById(room.snapshot.templateId) ?? ROOM_TEMPLATE;

  return (
    <View style={styles.container}>
      <View
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <StudioStage template={template} map={room.snapshot.map} mode="visit" />
      </View>
      <Header username={room.username} />
    </View>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <View style={styles.container}>
      {children}
      <Header />
    </View>
  );
}

function Header({ username }: { username?: string }) {
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

function Message({
  title,
  copy,
  children,
}: {
  title: string;
  copy: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageCopy}>{copy}</Text>
      {children}
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
  retry: {
    borderColor: "#4A4856",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryLabel: { color: "#F8F7FC", fontSize: 14, fontWeight: "700" },
});
