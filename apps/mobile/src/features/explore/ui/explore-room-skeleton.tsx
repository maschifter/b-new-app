import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Placeholder shown while a visited room loads. The real room is a full-bleed
// themed stage (StudioStage) with the same header overlay; the skeleton mirrors
// that framing — a full-screen stage surface plus the back / username shells —
// so the swap to the real room does not shift anything.
export function ExploreRoomSkeleton() {
  return (
    <View
      testID="explore-room-skeleton"
      style={styles.container}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[StyleSheet.absoluteFill, styles.stage]} />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.overlay}>
        <View style={styles.back} />
        <View style={styles.usernamePill} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#17171D", flex: 1 },
  stage: { backgroundColor: "#1F1F27" },
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
  back: { backgroundColor: "#26262F", borderRadius: 22, height: 44, width: 44 },
  usernamePill: { backgroundColor: "#26262F", borderRadius: 18, height: 34, width: 120 },
});
