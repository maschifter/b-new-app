import { artSource, catalogAtom } from "@/features/catalog";
import { ownedItemIdsAtom } from "@/features/shop";
import { COLORS } from "@/lib/theme/colors";
import { BouncablePress, MobileQueryErrorBoundary } from "@bnewapp/mobile-kit/ui";
import { type ContentRef, type Spot, fits } from "@bnewapp/studio-core";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useStudio } from "../state/studio-provider";
import { itemLabel } from "./placeholder";

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
export function ItemPicker({ onOpenShop }: { onOpenShop?: (() => void) | undefined }) {
  const { state, template, selectSpot, assign, clear } = useStudio();
  const { width } = useWindowDimensions();

  const spot = state.selectedSpotId
    ? template.spots.find((candidate) => candidate.id === state.selectedSpotId)
    : undefined;
  const visible = state.mode === "edit" && spot !== undefined;
  const current = spot ? state.map[spot.id] : undefined;

  // Subtract the sheet's L/R border (SHEET_BORDER each side, inside the box) as
  // well as its padding, then floor so 3 cards + 2 gaps never round *over* the
  // content width and wrap to 2 columns.
  const gridWidth = width - SHEET_PADDING * 2 - SHEET_BORDER * 2;
  const cardWidth = Math.floor((gridWidth - GRID_GAP * (COLUMNS - 1)) / COLUMNS);

  const close = () => selectSpot(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable className="flex-1 bg-scrim/55" onPress={close} accessibilityLabel="Close picker" />
      <View
        className="max-h-[72%] rounded-t-3xl border border-neon/35 bg-sheet px-5 pb-8 pt-[10px]"
        style={{
          shadowColor: COLORS.neon,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.6,
          shadowRadius: 20,
          elevation: 24,
        }}
      >
        {/* Neon accent line + grabber echo the room's glowing light strips. */}
        <View
          className="mb-[6px] h-[3px] w-[120px] self-center rounded-sm bg-neon opacity-90"
          style={{ shadowColor: COLORS.neon, shadowOpacity: 1, shadowRadius: 8 }}
        />
        <View className="mb-3 h-[5px] w-11 self-center rounded-[3px] bg-foreground/20" />

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

        {spot ? (
          <MobileQueryErrorBoundary
            title="Couldn't refresh items"
            copy="Your saved catalog is still available. Retry to check for new items."
            retryLabel="Retry loading items"
          >
            <CatalogGrid
              spot={spot}
              current={current}
              cardWidth={cardWidth}
              onAssign={(itemId) => assign(spot.id, { source: "catalog", id: itemId })}
              onOpenShop={
                onOpenShop
                  ? () => {
                      close();
                      onOpenShop();
                    }
                  : undefined
              }
            />
          </MobileQueryErrorBoundary>
        ) : null}
      </View>
    </Modal>
  );
}

interface CatalogGridProps {
  spot: Spot;
  current: ContentRef | undefined;
  cardWidth: number;
  onAssign: (itemId: string) => void;
  onOpenShop?: (() => void) | undefined;
}

function CatalogGrid({ spot, current, cardWidth, onAssign, onOpenShop }: CatalogGridProps) {
  const query = useAtomValue(catalogAtom);
  const owned = useAtomValue(ownedItemIdsAtom);
  const compatible = query.data.items.filter(
    (item) => item.art?.url && fits(item, spot) && owned.ids.has(item.id),
  );

  if (owned.isPending) {
    return (
      <View
        testID="inventory-picker-loading"
        accessible
        className="items-center gap-3 py-10"
        accessibilityRole="progressbar"
        accessibilityLabel="Loading owned items"
      >
        <ActivityIndicator color={COLORS.neon} />
        <Text className="text-sm text-muted">Loading your inventory…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerClassName="pb-2">
      {query.isError && !query.isFetching ? (
        <View className="mb-3 items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3">
          <Text accessibilityRole="alert" className="text-center text-xs text-foreground">
            Couldn't refresh items. Showing your saved catalog.
          </Text>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Retry refreshing catalog"
            onPress={() => void query.refetch()}
            className="rounded-lg border border-border px-3 py-2"
          >
            <Text className="text-xs font-bold text-foreground">Retry</Text>
          </BouncablePress>
        </View>
      ) : query.isFetching ? (
        <View className="mb-3 flex-row items-center justify-center gap-2">
          <ActivityIndicator
            accessibilityLabel="Refreshing catalog"
            color={COLORS.neon}
            size="small"
          />
          <Text className="text-xs text-muted">Checking for new items…</Text>
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-3">
        {compatible.map((item) => {
          const isCurrent = current?.source === "catalog" && current.id === item.id;
          const art = artSource(item);
          const label = item.name ?? itemLabel(item.id);
          return (
            <BouncablePress
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: isCurrent }}
              onPress={() => onAssign(item.id)}
              className="items-center gap-[6px]"
              style={{ width: cardWidth }}
            >
              <View
                className={`aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border bg-foreground/5 ${isCurrent ? "border-2 border-neon" : "border-foreground/10"}`}
                style={{
                  ...(isCurrent
                    ? {
                        shadowColor: COLORS.neon,
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
                    cachePolicy="memory-disk"
                  />
                ) : null}
                {isCurrent ? (
                  <View className="absolute right-[6px] top-[6px] size-[22px] items-center justify-center rounded-full bg-neon">
                    <Text className="text-[13px] font-black text-sheet">✓</Text>
                  </View>
                ) : null}
              </View>
              <Text
                className={`text-center text-xs ${isCurrent ? "font-extrabold text-foreground" : "font-semibold text-copy"}`}
                numberOfLines={1}
              >
                {label}
              </Text>
            </BouncablePress>
          );
        })}
      </View>

      {compatible.length === 0 ? (
        <View className="items-center gap-3 py-6">
          <Text className="text-center text-sm text-muted">
            You don't own a compatible item for this spot yet.
          </Text>
          {onOpenShop ? (
            <BouncablePress
              accessibilityRole="button"
              accessibilityLabel="Buy more in the Shop"
              onPress={onOpenShop}
              className="min-h-11 justify-center rounded-xl bg-primary px-5"
            >
              <Text className="text-sm font-extrabold text-foreground">Buy more in the Shop</Text>
            </BouncablePress>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}
