import { Screen } from "@/components/screen";
import { StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>Dance</Text>
        <Text style={styles.copy}>Your dance home will take shape here.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: "center", gap: 8 },
  title: { color: "#FFFFFF", fontSize: 32, fontWeight: "700" },
  copy: { color: "#C7C7D1", fontSize: 16 },
});
