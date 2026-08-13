import { StyleSheet, Text, View } from "react-native";

export function ExploreEmpty() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>No studios yet</Text>
      <Text style={styles.copy}>
        Once other dancers decorate their rooms, they'll show up here to explore.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 64 },
  title: { color: "#F8F7FC", fontSize: 18, fontWeight: "700" },
  copy: { color: "#898995", fontSize: 14, lineHeight: 20, textAlign: "center" },
});
