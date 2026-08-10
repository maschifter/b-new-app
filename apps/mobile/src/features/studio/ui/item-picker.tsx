import { BouncablePress } from "@/components/bouncable-press";
import { CATALOG, fits } from "@bnewapp/studio-core";
import { Image } from "expo-image";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useStudio } from "../state/studio-provider";
import { artSource } from "./art";
import { itemColor, itemLabel } from "./placeholder";

// Layout math for the item grid: 3 cards per row inside the sheet's
// horizontal padding, separated by GRID_GAP. Card width is derived from the
// live window width so it stays crisp across devices.
const COLUMNS = 3;
const GRID_GAP = 12;
const SHEET_PADDING = 20;
const SHEET_BORDER = 1;

// Bottom-sheet modal: tap a spot -> a neon inventory grid of only the catalog
// items that `fits()` the spot -> pick one (assign) or remove the current one
// (clear). Compatibility is enforced here at write time; reconcile re-checks it
// at read time. This is presentation only — the studio logic is untouched.
export function ItemPicker() {
  const { state, template, selectSpot, assign, clear } = useStudio();
  const { width } = useWindowDimensions();

  const spot = state.selectedSpotId
    ? template.spots.find((candidate) => candidate.id === state.selectedSpotId)
    : undefined;
  const visible = state.mode === "edit" && spot !== undefined;
  const current = spot ? state.map[spot.id] : undefined;
  const compatible = spot ? CATALOG.filter((item) => fits(item, spot)) : [];

  // Subtract the sheet's L/R border (SHEET_BORDER each side, inside the box) as
  // well as its padding, then floor so 3 cards + 2 gaps never round *over* the
  // content width and wrap to 2 columns.
  const gridWidth = width - SHEET_PADDING * 2 - SHEET_BORDER * 2;
  const cardWidth = Math.floor((gridWidth - GRID_GAP * (COLUMNS - 1)) / COLUMNS);

  const close = () => selectSpot(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close picker" />
      <View style={styles.sheet}>
        {/* Neon accent line + grabber echo the room's glowing light strips. */}
        <View style={styles.glowLine} />
        <View style={styles.grabber} />

        <View style={styles.header}>
          <Text style={styles.title}>{spot ? itemLabel(spot.id) : "Choose an item"}</Text>
          <View style={styles.headerActions}>
            {current ? (
              <BouncablePress
                accessibilityRole="button"
                accessibilityLabel="Remove item"
                onPress={() => spot && clear(spot.id)}
                style={styles.removeButton}
              >
                <Text style={styles.removeGlyph}>🗑</Text>
              </BouncablePress>
            ) : null}
            <BouncablePress accessibilityRole="button" onPress={close} style={styles.close}>
              <Text style={styles.closeLabel}>Done</Text>
            </BouncablePress>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.grid}>
            {compatible.map((item) => {
              const isCurrent = current?.source === "catalog" && current.id === item.id;
              const art = artSource(item.id);
              return (
                <BouncablePress
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCurrent }}
                  onPress={() => spot && assign(spot.id, { source: "catalog", id: item.id })}
                  style={[styles.card, { width: cardWidth }]}
                >
                  {/* Large art tile so visually-distinct variants (e.g. stage vs
                      stage-2) read at a glance; falls back to the type color. */}
                  <View
                    style={[
                      styles.tile,
                      { backgroundColor: itemColor(item) },
                      isCurrent && styles.tileSelected,
                    ]}
                  >
                    {art ? (
                      <Image source={art} style={styles.art} contentFit="contain" />
                    ) : null}
                    {isCurrent ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeCheck}>✓</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[styles.cardLabel, isCurrent && styles.cardLabelSelected]}
                    numberOfLines={1}
                  >
                    {itemLabel(item.id)}
                  </Text>
                </BouncablePress>
              );
            })}
          </View>

          {compatible.length === 0 ? (
            <Text style={styles.empty}>No compatible items yet.</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const NEON = "#A78BFA";

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(6,4,16,0.55)" },
  sheet: {
    backgroundColor: "#160E29",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: "rgba(167,139,250,0.35)",
    borderWidth: SHEET_BORDER,
    maxHeight: "72%",
    paddingBottom: 32,
    paddingHorizontal: SHEET_PADDING,
    paddingTop: 10,
    // Purple glow rising off the top edge, matching the room's neon lighting.
    shadowColor: NEON,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 24,
  },
  glowLine: {
    alignSelf: "center",
    backgroundColor: NEON,
    borderRadius: 2,
    height: 3,
    marginBottom: 6,
    opacity: 0.9,
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    width: 120,
  },
  grabber: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 3,
    height: 5,
    marginBottom: 12,
    width: 44,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { color: "#F8F7FC", flex: 1, fontSize: 20, fontWeight: "800" },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 10 },
  removeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,143,143,0.12)",
    borderColor: "rgba(255,143,143,0.5)",
    borderRadius: 10,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 44,
  },
  removeGlyph: { fontSize: 16 },
  close: {
    backgroundColor: "rgba(167,139,250,0.16)",
    borderColor: NEON,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  closeLabel: { color: "#F8F7FC", fontSize: 14, fontWeight: "800" },
  scroll: { paddingBottom: 8 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  card: { alignItems: "center", gap: 6 },
  tile: {
    alignItems: "center",
    aspectRatio: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  tileSelected: {
    borderColor: NEON,
    borderWidth: 2,
    // Neon halo around the chosen tile — the core "juice" of the selection.
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 12,
    elevation: 12,
  },
  art: { height: "88%", width: "88%" },
  badge: {
    alignItems: "center",
    backgroundColor: NEON,
    borderRadius: 11,
    height: 22,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    top: 6,
    width: 22,
  },
  badgeCheck: { color: "#160E29", fontSize: 13, fontWeight: "900" },
  cardLabel: {
    color: "#C9C6D6",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  cardLabelSelected: { color: "#F8F7FC", fontWeight: "800" },
  empty: { color: "#898995", fontSize: 14, paddingVertical: 24, textAlign: "center" },
});
