import { StyleSheet, View } from "react-native";

// Placeholder rows shown while the first page loads. Mirrors the row layout so
// the swap to real rows does not shift the scroll position.
export function ExploreSkeleton() {
  return (
    <View
      testID="explore-skeleton"
      style={styles.list}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {SKELETON_KEYS.map((key) => (
        <View key={key} style={styles.row}>
          <View style={styles.avatar} />
          <View style={styles.body}>
            <View style={styles.line} />
            <View style={[styles.line, styles.lineShort]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"];

const styles = StyleSheet.create({
  list: { gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  row: {
    alignItems: "center",
    backgroundColor: "#17171D",
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  avatar: { backgroundColor: "#1F1F27", borderRadius: 22, height: 44, width: 44 },
  body: { flex: 1, gap: 6 },
  line: { backgroundColor: "#1F1F27", borderRadius: 4, height: 12, width: "60%" },
  lineShort: { width: "35%" },
});
