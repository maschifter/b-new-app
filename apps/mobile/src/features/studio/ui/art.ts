import type { ArtHitBox, CatalogItem } from "@bnewapp/studio-core";
import type { ImageSource } from "expo-image";

export type { ArtHitBox } from "@bnewapp/studio-core";

/** Remote art uploaded through the admin catalog, or null until the item has art. */
export function artSource(item: CatalogItem): ImageSource | null {
  return item.art?.url ? { uri: item.art.url } : null;
}

/** The visible, non-transparent portion computed for uploaded remote art. */
export function artHitBox(item: CatalogItem): ArtHitBox | null {
  return item.art?.hitbox ?? null;
}
