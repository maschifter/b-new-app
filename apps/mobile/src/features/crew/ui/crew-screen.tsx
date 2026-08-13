import { Screen } from "@/components/screen";
import { StyleSheet, Text, View } from "react-native";

export function CrewScreen() {
  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>CREW</Text>
        <Text style={styles.title}>Your crew</Text>
        <Text style={styles.copy}>Follow dancers and see your crew here. Coming soon.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: 8, justifyContent: "center" },
  eyebrow: { color: "#A78BFA", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#F8F7FC", fontSize: 32, fontWeight: "700", letterSpacing: -0.5 },
  copy: { color: "#C7C7D1", fontSize: 16, lineHeight: 24 },
});
