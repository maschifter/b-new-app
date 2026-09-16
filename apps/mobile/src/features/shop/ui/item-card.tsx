import { artSource } from "@/features/catalog";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { resolvePrice } from "@bnewapp/studio-core";
import type { CatalogItemDTO } from "@bnewapp/types";
import { Image } from "expo-image";
import { memo } from "react";
import { Text, View } from "react-native";

interface ItemCardProps {
  item: CatalogItemDTO;
  width: number;
  owned?: boolean;
  disabled?: boolean;
  disabledLabel?: string;
  onPurchase?: (itemId: string) => void;
}

export const ItemCard = memo(function ItemCard({
  item,
  width,
  owned = false,
  disabled = false,
  disabledLabel,
  onPurchase,
}: ItemCardProps) {
  const art = artSource(item);
  const price = resolvePrice(item);
  const hasMissingPremiumPrice = item.access === "premium" && price === 0;
  const priceLabel = hasMissingPremiumPrice
    ? "Price unavailable"
    : price === 0
      ? "Free"
      : `✨ ${price.toLocaleString()}`;
  const actionLabel = owned ? "Owned" : (disabledLabel ?? "Buy");
  const purchaseDisabled = owned || disabled || hasMissingPremiumPrice;

  return (
    <View
      className="overflow-hidden rounded-2xl border border-border bg-panel p-3"
      style={{ width }}
    >
      <View className="aspect-square items-center justify-center rounded-xl bg-panel-raised">
        {art ? (
          <Image
            source={art}
            style={{ height: "88%", width: "88%" }}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        ) : null}
      </View>
      <Text className="mt-3 text-base font-extrabold text-foreground" numberOfLines={1}>
        {item.name}
      </Text>
      <Text className="mt-1 text-sm font-bold text-neon">{priceLabel}</Text>
      {onPurchase ? (
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} ${item.name}`}
          accessibilityState={{ disabled: purchaseDisabled }}
          disabled={purchaseDisabled}
          onPress={() => onPurchase(item.id)}
          className={`mt-3 min-h-11 items-center justify-center rounded-xl px-3 ${purchaseDisabled ? "bg-panel-muted" : "bg-primary"}`}
        >
          <Text
            className={`text-sm font-extrabold ${purchaseDisabled ? "text-muted" : "text-foreground"}`}
          >
            {actionLabel}
          </Text>
        </BouncablePress>
      ) : null}
    </View>
  );
});
