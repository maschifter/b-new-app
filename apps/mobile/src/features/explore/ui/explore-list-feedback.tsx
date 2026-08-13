import { BouncablePress } from "@/components/bouncable-press";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export function ExploreListFooter() {
  return (
    <View testID="explore-footer" style={styles.footer}>
      <ActivityIndicator color="#8B5CF6" />
    </View>
  );
}

export function ExplorePaginationError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.paginationError}>
      <Text style={styles.errorCopy}>Couldn't load more studios.</Text>
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel="Retry loading more studios"
        onPress={onRetry}
        style={styles.paginationRetry}
      >
        <Text style={styles.retryLabel}>Retry</Text>
      </BouncablePress>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { paddingVertical: 20 },
  paginationError: { alignItems: "center", gap: 8, paddingVertical: 20 },
  paginationRetry: {
    borderColor: "#4A4856",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  errorCopy: { color: "#898995", fontSize: 14, lineHeight: 20, textAlign: "center" },
  retryLabel: { color: "#F8F7FC", fontSize: 14, fontWeight: "700" },
});
