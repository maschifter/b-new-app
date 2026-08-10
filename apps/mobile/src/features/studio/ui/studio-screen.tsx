import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { SaveStatus } from "../state/decoration-reducer";
import { StudioProvider, useStudio } from "../state/studio-provider";
import { ItemPicker } from "./item-picker";
import { StudioStage } from "./studio-stage";

const STATUS_LABELS: Partial<Record<SaveStatus, string>> = {
  dirty: "Unsaved…",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

interface StudioScreenProps {
  ownerId?: string;
  /** App-owned control shown top-right of the header (e.g. sign out). */
  headerRight?: ReactNode;
}

export function StudioScreen({ ownerId, headerRight }: StudioScreenProps) {
  return (
    <StudioProvider ownerId={ownerId}>
      <StudioContent headerRight={headerRight} />
    </StudioProvider>
  );
}

function StudioContent({ headerRight }: { headerRight?: ReactNode }) {
  const { state, template, hydrated, selectSpot } = useStudio();
  const statusLabel = STATUS_LABELS[state.status];

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.loading} edges={["top", "left", "right"]}>
        <ActivityIndicator color="#A78BFA" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Studio</Text>
          {statusLabel ? <Text style={styles.status}>{statusLabel}</Text> : null}
        </View>
        {headerRight ?? null}
      </View>
      <StudioStage
        template={template}
        map={state.map}
        mode={state.mode}
        selectedSpotId={state.selectedSpotId}
        onSelectSpot={selectSpot}
      />
      <ItemPicker />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101014" },
  loading: { alignItems: "center", backgroundColor: "#101014", flex: 1, justifyContent: "center" },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { color: "#F8F7FC", fontSize: 22, fontWeight: "700", letterSpacing: -0.4 },
  status: { color: "#898995", fontSize: 12, marginTop: 2 },
});
