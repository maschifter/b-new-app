import { BouncablePress } from "@/components/bouncable-press";
import { CATALOG, fits } from "@bnewapp/studio-core";
import { Image } from "expo-image";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
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
      <Pressable
        className="flex-1 bg-[#060410]/55"
        onPress={close}
        accessibilityLabel="Close picker"
      />
      <View
        className="max-h-[72%] rounded-t-3xl border border-neon/35 bg-[#160E29] px-5 pb-8 pt-[10px]"
        style={{
          shadowColor: NEON,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.6,
          shadowRadius: 20,
          elevation: 24,
        }}
      >
        {/* Neon accent line + grabber echo the room's glowing light strips. */}
        <View
          className="mb-[6px] h-[3px] w-[120px] self-center rounded-sm bg-neon opacity-90"
          style={{ shadowColor: NEON, shadowOpacity: 1, shadowRadius: 8 }}
        />
        <View className="mb-3 h-[5px] w-11 self-center rounded-[3px] bg-white/20" />

        <View className="mb-4 flex-row items-center justify-between">
          <Text className="flex-1 text-xl font-extrabold text-foreground">
            {spot ? itemLabel(spot.id) : "Choose an item"}
          </Text>
          <View className="flex-row items-center gap-[10px]">
            {current ? (
              <BouncablePress
                accessibilityRole="button"
                accessibilityLabel="Remove item"
                onPress={() => spot && clear(spot.id)}
                className="h-[38px] w-11 items-center justify-center rounded-[10px] border border-danger/50 bg-danger/10"
              >
                <Text className="text-base">🗑</Text>
              </BouncablePress>
            ) : null}
            <BouncablePress
              accessibilityRole="button"
              onPress={close}
              className="rounded-[10px] border border-neon bg-neon/15 px-4 py-[9px]"
            >
              <Text className="text-sm font-extrabold text-foreground">Done</Text>
            </BouncablePress>
          </View>
        </View>

        <ScrollView contentContainerClassName="pb-2">
          <View className="flex-row flex-wrap gap-3">
            {compatible.map((item) => {
              const isCurrent = current?.source === "catalog" && current.id === item.id;
              const art = artSource(item.id);
              return (
                <BouncablePress
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCurrent }}
                  onPress={() => spot && assign(spot.id, { source: "catalog", id: item.id })}
                  className="items-center gap-[6px]"
                  style={{ width: cardWidth }}
                >
                  {/* Large art tile so visually-distinct variants (e.g. stage vs
                      stage-2) read at a glance; falls back to the type color. */}
                  <View
                    className={`aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border ${isCurrent ? "border-2 border-neon" : "border-white/10"}`}
                    style={{
                      backgroundColor: itemColor(item),
                      ...(isCurrent
                        ? {
                            shadowColor: NEON,
                            shadowOpacity: 0.95,
                            shadowRadius: 12,
                            elevation: 12,
                          }
                        : undefined),
                    }}
                  >
                    {art ? (
                      <Image
                        source={art}
                        style={{ height: "88%", width: "88%" }}
                        contentFit="contain"
                      />
                    ) : null}
                    {isCurrent ? (
                      <View className="absolute right-[6px] top-[6px] size-[22px] items-center justify-center rounded-full bg-neon">
                        <Text className="text-[13px] font-black text-[#160E29]">✓</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    className={`text-center text-xs ${isCurrent ? "font-extrabold text-foreground" : "font-semibold text-[#C9C6D6]"}`}
                    numberOfLines={1}
                  >
                    {itemLabel(item.id)}
                  </Text>
                </BouncablePress>
              );
            })}
          </View>

          {compatible.length === 0 ? (
            <Text className="py-6 text-center text-sm text-muted">No compatible items yet.</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const NEON = "#A78BFA";
