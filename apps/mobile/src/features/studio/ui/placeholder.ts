import { catalogItemById } from "../data/catalog";
import type { CatalogItem, ContentRef } from "../domain/types";

// Presentation for the Foundation stage: items render as labelled colored
// blocks. Color is derived from an item's `type` tag, the label from its id —
// kept out of the domain so the data stays art-free (real art is a later stage).

const TYPE_COLORS: Record<string, string> = {
  floor: "#6D5D4B",
  wall: "#3E6D8E",
  video: "#7A3E8E",
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
  color: string;
}

/** Resolve what a filled slot should look like, or null if it can't be shown. */
export function describeContent(ref: ContentRef): ContentPresentation | null {
  if (ref.source === "catalog") {
    const item = catalogItemById(ref.id);
    if (!item) return null;
    return { label: itemLabel(item.id), color: itemColor(item) };
  }
  // Video (UGC) has no catalog entry this stage; show a neutral screen block.
  return { label: "Video", color: TYPE_COLORS.video ?? DEFAULT_COLOR };
}
