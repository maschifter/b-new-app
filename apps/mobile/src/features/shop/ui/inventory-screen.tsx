import { MobileQueryErrorBoundary } from "@/components/error-boundary";
import { catalogAtom } from "@/features/catalog";
import { COLORS } from "@/lib/theme/colors";
import type { CatalogItemDTO } from "@bnewapp/types";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { FlatList, RefreshControl, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { inventoryAtom, walletAtom } from "../_atoms/queries";
import { ownedCatalogItemsAtom } from "../_atoms/ui";
import { EconomyHeader } from "./economy-header";
import { ItemCard } from "./item-card";
import { ShopSkeleton } from "./shop-skeleton";

interface InventoryScreenProps {
  onOpenShop: () => void;
}

export function InventoryScreen({ onOpenShop }: InventoryScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-app" edges={["top", "left", "right"]}>
      <MobileQueryErrorBoundary
        title="Couldn't load your inventory"
        retryLabel="Retry loading inventory"
      >
        <InventoryContent onOpenShop={onOpenShop} />
      </MobileQueryErrorBoundary>
    </SafeAreaView>
  );
}

function InventoryContent({ onOpenShop }: InventoryScreenProps) {
  const wallet = useAtomValue(walletAtom);
  const inventory = useAtomValue(inventoryAtom);
  const catalog = useAtomValue(catalogAtom);
  const items = useAtomValue(ownedCatalogItemsAtom);
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - 32 - 12) / 2);
  const refresh = useCallback(
    () => Promise.all([wallet.refetch(), inventory.refetch(), catalog.refetch()]),
    [wallet.refetch, inventory.refetch, catalog.refetch],
  );
  const renderItem = useCallback(
    ({ item }: { item: CatalogItemDTO }) => <ItemCard item={item} width={cardWidth} />,
    [cardWidth],
  );

  if (wallet.isPending || inventory.isPending) return <ShopSkeleton />;

  return (
    <View className="flex-1">
      <EconomyHeader
        title="Inventory"
        glow={wallet.data?.glow ?? 0}
        action={{ label: "Shop", onPress: onOpenShop }}
      />
      <FlatList
        testID="inventory-grid"
        data={items}
        numColumns={2}
        keyExtractor={itemKey}
        renderItem={renderItem}
        columnWrapperClassName="gap-3"
        contentContainerClassName="grow gap-3 px-4 pb-6"
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center gap-3 px-8">
            <Text className="text-xl font-extrabold text-foreground">Your inventory is empty</Text>
            <Text className="text-center text-sm leading-5 text-muted">
              Visit the Shop to find something for your studio.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={wallet.isRefetching || inventory.isRefetching || catalog.isRefetching}
            onRefresh={() => void refresh()}
            tintColor={COLORS.primary}
          />
        }
      />
    </View>
  );
}

function itemKey(item: CatalogItemDTO): string {
  return item.id;
}
