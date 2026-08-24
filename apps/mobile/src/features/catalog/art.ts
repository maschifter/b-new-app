import type { ArtHitBox, CatalogItem } from "@bnewapp/studio-core";
import type { ImageSource } from "expo-image";

export type { ArtHitBox };

export function artSource(item: CatalogItem): ImageSource | null {
  return item.art?.url ? { uri: item.art.url } : null;
}

export function artHitBox(item: CatalogItem): ArtHitBox | null {
  return item.art?.hitbox ?? null;
}
