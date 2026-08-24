import { type CatalogItem, type ContentRef, defaultItemLabel } from "@bnewapp/studio-core";
import type { ImageSource } from "expo-image";
import { type ArtHitBox, artHitBox, artSource } from "./art";

// Presentation layer: only uploaded remote art is renderable. Seed metadata is
// retained for offline reconciliation, but it must never become placeholder UI.

function primaryType(item: CatalogItem): string | undefined {
  const type = item.tags.type;
  return Array.isArray(type) ? type[0] : type;
}

export { defaultItemLabel as itemLabel } from "@bnewapp/studio-core";

export interface ContentPresentation {
  label: string;
  /** Admin-uploaded remote art. */
  art: ImageSource;
  /** A screen that plays video (hero or preview) — the spot shows a ▶ overlay. */
  isVideo: boolean;
  /** Per-asset fit override for art whose native canvas differs from its slot. */
  artFit?: "contain" | "cover" | "fill";
  /** Alpha-aware hit area for art that includes transparent composition padding. */
  artHitBox?: ArtHitBox;
}

function isVideoType(item: CatalogItem): boolean {
  const type = primaryType(item);
  return type === "video" || type === "preview";
}

/** Resolve what a filled slot should look like, or null if it can't be shown. */
export function describeContent(
  ref: ContentRef,
  item: CatalogItem | undefined,
): ContentPresentation | null {
  if (ref.source === "catalog") {
    if (!item) return null;
    const art = artSource(item);
    if (!art) return null;
    const isMirror = item.id === "mirror" || item.id === "mirror-2";
    const hitBox = artHitBox(item);

    return {
      label: item.name ?? defaultItemLabel(item.id),
      art,
      ...(hitBox ? { artHitBox: hitBox } : {}),
      isVideo: isVideoType(item),
      // Both mirror variants deliberately fill the same authored wall-art
      // frame. Their source canvases have different aspect ratios, so contain
      // would otherwise make Mirror 2 smaller and differently positioned.
      ...(isMirror ? { artFit: "fill" as const } : {}),
    };
  }
  // Video (UGC) has no uploaded thumbnail in this stage.
  return null;
}
