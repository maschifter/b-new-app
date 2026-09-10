import { MobileQueryErrorBoundary } from "@/components/error-boundary";
import { catalogAtom } from "@/features/catalog";
import { canAfford } from "@bnewapp/studio-core";
import type { CatalogItemDTO } from "@bnewapp/types";
import { useAtom, useAtomValue } from "jotai";
import { useCallback } from "react";
import { FlatList, RefreshControl, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { purchaseMutationAtom } from "../_atoms/mutations";
import { inventoryAtom, walletAtom } from "../_atoms/queries";
import {
  ownedItemIdsAtom,
  selectedCategoryAtom,
  shopCategoriesAtom,
  visibleShopItemsAtom,
} from "../_atoms/ui";
import { EconomyHeader } from "./economy-header";
import { ItemCard } from "./item-card";
import { ShopSkeleton } from "./shop-skeleton";

interface ShopScreenProps {
  onBack?: () => void;
}

export function ShopScreen({ onBack }: ShopScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-app" edges={["top", "left", "right", "bottom"]}>
      <MobileQueryErrorBoundary title="Couldn't load the Shop" retryLabel="Retry loading the Shop">
        <ShopContent onBack={onBack} />
      </MobileQueryErrorBoundary>
    </SafeAreaView>
  );
}

function ShopContent({ onBack }: ShopScreenProps) {
  const wallet = useAtomValue(walletAtom);
  const inventory = useAtomValue(inventoryAtom);
  const catalog = useAtomValue(catalogAtom);
  const owned = useAtomValue(ownedItemIdsAtom);
  const items = useAtomValue(visibleShopItemsAtom);
  const categories = useAtomValue(shopCategoriesAtom);
  const [selectedCategory, setSelectedCategory] = useAtom(selectedCategoryAtom);
  const mutation = useAtomValue(purchaseMutationAtom);
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - 32 - 12) / 2);

  const purchase = useCallback((itemId: string) => mutation.mutate(itemId), [mutation.mutate]);
  const refresh = useCallback(
    () => Promise.all([wallet.refetch(), inventory.refetch(), catalog.refetch()]),
    [wallet.refetch, inventory.refetch, catalog.refetch],
  );
  const renderItem = useCallback(
    ({ item }: { item: CatalogItemDTO }) => {
      const affordable = canAfford(wallet.data?.glow ?? 0, item);
      const isPurchasingItem = mutation.isPending && mutation.variables === item.id;
      return (
        <ItemCard
          item={item}
          width={cardWidth}
          owned={owned.ids.has(item.id)}
          disabled={mutation.isPending || !affordable}
          disabledLabel={isPurchasingItem ? "Buying…" : affordable ? undefined : "Not enough Glow"}
          onPurchase={purchase}
        />
      );
    },
    [cardWidth, mutation.isPending, mutation.variables, owned.ids, purchase, wallet.data?.glow],
  );

  if (catalog.dataUpdatedAt === 0 && catalog.isError) throw catalog.error;
  if (wallet.isPending || owned.isPending || catalog.dataUpdatedAt === 0) {
    return <ShopSkeleton />;
  }
  const glow = wallet.data?.glow ?? 0;

  return (
    <View className="flex-1">
      <EconomyHeader title="Shop" glow={glow} onBack={onBack} />
      {mutation.isError ? (
        <Text
          accessibilityRole="alert"
          className="mx-4 mb-3 rounded-xl bg-danger/10 p-3 text-center text-sm text-danger"
        >
          {mutation.error.message}
        </Text>
      ) : null}
      <FlatList
        testID="shop-grid"
        data={items}
        numColumns={2}
        keyExtractor={itemKey}
        renderItem={renderItem}
        columnWrapperClassName="gap-3"
        contentContainerClassName="gap-3 px-4 pb-6"
        ListHeaderComponent={
          <CategoryFilter
            categories={categories}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
        }
        ListEmptyComponent={
          <Text className="py-12 text-center text-sm text-muted">No items in this category.</Text>
        }
        refreshControl={
          <RefreshControl
            refreshing={wallet.isRefetching || inventory.isRefetching || catalog.isRefetching}
            onRefresh={() => void refresh()}
            tintColor="#8B5CF6"
          />
        }
      />
    </View>
  );
}

interface CategoryFilterProps {
  categories: string[];
  selected: string | null;
  onSelect: (category: string | null) => void;
}

function CategoryFilter({ categories, selected, onSelect }: CategoryFilterProps) {
  const values: (string | null)[] = [null, ...categories];
  return (
    <FlatList
      horizontal
      data={values}
      keyExtractor={(item) => item ?? "all"}
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 py-3"
      renderItem={({ item }) => {
        const active = selected === item;
        const label = item ?? "All";
        return (
          <Text
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${label}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item)}
            className={`overflow-hidden rounded-full border px-4 py-3 text-sm font-bold ${active ? "border-neon bg-neon/20 text-foreground" : "border-border bg-panel text-copy"}`}
          >
            {label}
          </Text>
        );
      }}
    />
  );
}

function itemKey(item: CatalogItemDTO): string {
  return item.id;
}
