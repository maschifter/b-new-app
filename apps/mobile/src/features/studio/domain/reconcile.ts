import { fits } from "./fits";
import type { CatalogItem, ContentRef, DecorationSnapshot, RoomTemplate } from "./types";

// Reconcile before render (design §6, rule 8): a saved snapshot is validated
// against the *current* template + catalog, because both are designer-owned and
// change after a room is saved. Entries pointing at a removed spot, a removed
// item, or a spot whose accept rule no longer matches are dropped — never
// rendered. This enforces compatibility (rule 1) at read as well as write,
// reusing the same `fits()` policy.

export function reconcile(
  snapshot: DecorationSnapshot,
  template: RoomTemplate,
  catalog: CatalogItem[],
): DecorationSnapshot {
  const spotsById = new Map(template.spots.map((spot) => [spot.id, spot]));
  const itemsById = new Map(catalog.map((item) => [item.id, item]));

  const cleaned: Record<string, ContentRef> = {};
  for (const [spotId, ref] of Object.entries(snapshot.map)) {
    const spot = spotsById.get(spotId);
    if (!spot) continue; // spot was removed from the template

    if (ref.source === "catalog") {
      const item = itemsById.get(ref.id);
      if (!item) continue; // item was removed from the catalog
      if (!fits(item, spot)) continue; // accept rule no longer matches this item
    }
    // Video refs (UGC) have no catalog entry to check against yet; they are
    // validated in a later stage and kept as long as the spot still exists.

    cleaned[spotId] = ref;
  }

  return { ...snapshot, map: cleaned };
}
