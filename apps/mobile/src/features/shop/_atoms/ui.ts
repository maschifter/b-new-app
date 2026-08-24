import { catalogAtom, catalogItemByIdAtom } from "@/features/catalog";
import type { CatalogItemDTO } from "@bnewapp/types";
import { atom } from "jotai";
import { inventoryAtom } from "./queries";

export const ownedItemIdsAtom = atom((get) => {
  const inventory = get(inventoryAtom);
  return {
    ids: new Set((inventory.data?.items ?? []).map((item) => item.itemId)),
    isPending: inventory.isPending,
  };
});

export const selectedCategoryAtom = atom<string | null>(null);

function categoryValues(item: CatalogItemDTO): string[] {
  const value = item.tags.type;
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value : [];
}

function hasRenderableArt(item: CatalogItemDTO): boolean {
  return Boolean(item.art?.url);
}

export const shopCategoriesAtom = atom((get) => {
  const categories = new Set<string>();
  for (const item of get(catalogAtom).data.items.filter(hasRenderableArt)) {
    for (const category of categoryValues(item)) categories.add(category);
  }
  return [...categories].sort((left, right) => left.localeCompare(right));
});

export const visibleShopItemsAtom = atom((get) => {
  const selected = get(selectedCategoryAtom);
  const items = get(catalogAtom).data.items.filter(hasRenderableArt);
  return selected === null
    ? items
    : items.filter((item) => categoryValues(item).includes(selected));
});

export const ownedCatalogItemsAtom = atom((get) => {
  const inventory = get(inventoryAtom).data?.items ?? [];
  const byId = get(catalogItemByIdAtom);
  return inventory.flatMap(({ itemId }) => {
    const item = byId.get(itemId);
    return item && hasRenderableArt(item) ? [item] : [];
  });
});
