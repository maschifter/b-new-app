import { type CatalogItem, type ContentRef, catalogItemById } from "@bnewapp/studio-core";
import type { ImageSource } from "expo-image";
import { type ArtHitBox, artHitBox, artSource } from "./art";

// Presentation layer: turns a ContentRef into what a filled slot shows. Items
// render as their bundled art (see ./art), falling back to a labelled colored
// block when an item has none. Color is derived from an item's `type` tag, the
// label from its id — kept out of the domain so the data stays art-free.

const TYPE_COLORS: Record<string, string> = {
  floor: "#6D5D4B",
  wall: "#3E6D8E",
  video: "#7A3E8E",
  preview: "#9B6DC9",
  tall: "#B5651D",
  low: "#455A64",
  lounge: "#C77DA0",
  ceiling: "#C9A227",
  decor: "#3E8E5A",
};
const DEFAULT_COLOR = "#4A4856";

function primaryType(item: CatalogItem): string | undefined {
  const type = item.tags.type;
  return Array.isArray(type) ? type[0] : type;
}

/** "big-screen" -> "Big Screen" */
export function itemLabel(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function itemColor(item: CatalogItem): string {
  const type = primaryType(item);
  return (type && TYPE_COLORS[type]) ?? DEFAULT_COLOR;
}

export interface ContentPresentation {
  label: string;
  /** Colored-block fill; also the tint behind the art while it loads. */
  color: string;
  /** Bundled art for the item, or null to render the colored block only. */
  art: ImageSource | null;
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
export function describeContent(ref: ContentRef): ContentPresentation | null {
  if (ref.source === "catalog") {
    const item = catalogItemById(ref.id);
    if (!item) return null;
    const isMirror = item.id === "mirror" || item.id === "mirror-2";
    const hitBox = artHitBox(item.id);

    return {
      label: itemLabel(item.id),
      color: itemColor(item),
      art: artSource(item.id),
      ...(hitBox ? { artHitBox: hitBox } : {}),
      isVideo: isVideoType(item),
      // Both mirror variants deliberately fill the same authored wall-art
      // frame. Their source canvases have different aspect ratios, so contain
      // would otherwise make Mirror 2 smaller and differently positioned.
      ...(isMirror ? { artFit: "fill" as const } : {}),
    };
  }
  // Video (UGC) has no catalog entry this stage; show a neutral screen block.
  return { label: "Video", color: TYPE_COLORS.video ?? DEFAULT_COLOR, art: null, isVideo: true };
}
