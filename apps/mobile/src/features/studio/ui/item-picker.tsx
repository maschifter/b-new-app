import { BouncablePress } from "@/components/bouncable-press";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CATALOG } from "../data/catalog";
import { fits } from "../domain/fits";
import { useStudio } from "../state/studio-provider";
import { itemColor, itemLabel } from "./placeholder";

// Bottom-sheet modal: tap a spot -> list only the catalog items that `fits()`
// the spot -> pick one (assign) or remove the current one (clear). Compatibility
// is enforced here at write time; reconcile re-checks it at read time.
export function ItemPicker() {
  const { state, template, selectSpot, assign, clear } = useStudio();

  const spot = state.selectedSpotId
    ? template.spots.find((candidate) => candidate.id === state.selectedSpotId)
    : undefined;
  const visible = state.mode === "edit" && spot !== undefined;
  const current = spot ? state.map[spot.id] : undefined;
  const compatible = spot ? CATALOG.filter((item) => fits(item, spot)) : [];

  const close = () => selectSpot(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close picker" />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{spot ? itemLabel(spot.id) : "Choose an item"}</Text>
          <BouncablePress accessibilityRole="button" onPress={close} style={styles.close}>
            <Text style={styles.closeLabel}>Done</Text>
          </BouncablePress>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {current ? (
            <BouncablePress
              accessibilityRole="button"
              onPress={() => spot && clear(spot.id)}
              style={[styles.row, styles.removeRow]}
            >
              <Text style={styles.removeLabel}>Remove item</Text>
            </BouncablePress>
          ) : null}

          {compatible.map((item) => {
            const isCurrent = current?.source === "catalog" && current.id === item.id;
            return (
              <BouncablePress
                key={item.id}
                accessibilityRole="button"
                onPress={() => spot && assign(spot.id, { source: "catalog", id: item.id })}
                style={[styles.row, isCurrent && styles.rowSelected]}
              >
                <View style={[styles.swatch, { backgroundColor: itemColor(item) }]} />
                <Text style={styles.rowLabel}>{itemLabel(item.id)}</Text>
                {isCurrent ? <Text style={styles.check}>✓</Text> : null}
              </BouncablePress>
            );
          })}

          {compatible.length === 0 ? (
            <Text style={styles.empty}>No compatible items yet.</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    backgroundColor: "#1B1B22",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { color: "#F8F7FC", fontSize: 18, fontWeight: "700" },
  close: {
    borderColor: "#4A4856",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  closeLabel: { color: "#F8F7FC", fontSize: 14, fontWeight: "700" },
  list: { gap: 10 },
  row: {
    alignItems: "center",
    backgroundColor: "#26262F",
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
  },
  rowSelected: { borderColor: "#A78BFA", borderWidth: 2 },
  rowLabel: { color: "#F8F7FC", flex: 1, fontSize: 16, fontWeight: "600" },
  swatch: { borderRadius: 8, height: 32, width: 32 },
  check: { color: "#A78BFA", fontSize: 18, fontWeight: "800" },
  removeRow: {
    backgroundColor: "transparent",
    borderColor: "#4A4856",
    borderWidth: 1,
    justifyContent: "center",
  },
  removeLabel: { color: "#FF8F8F", fontSize: 15, fontWeight: "700" },
  empty: { color: "#898995", fontSize: 14, paddingVertical: 12, textAlign: "center" },
});
