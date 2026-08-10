import type { CatalogItem } from "../domain/types";

// Seed catalog for the Foundation stage. Placeholder items only — no art yet;
// each renders as a labelled colored block (color derived from its `type` tag,
// label from its id — see ../ui/placeholder.ts). Tags are the semantic matching
// keys consumed by `fits()`; presentation is derived separately so the domain
// stays art-free. `type=video` items are static screen placeholders here; real
// per-user video (source "video", UGC) is a later stage.

export const CATALOG: CatalogItem[] = [
  // floor — type=floor, size=L
  { id: "rug", tags: { type: "floor", size: "L" } },
  { id: "stage", tags: { type: "floor", size: "L" } },
  { id: "dance-mat", tags: { type: "floor", size: "L" } },

  // wall — type=wall, size=M
  { id: "poster", tags: { type: "wall", size: "M" } },
  { id: "mirror", tags: { type: "wall", size: "M" } },

  // hero screen — type=video, size=L (placeholder for a screen)
  { id: "big-screen", tags: { type: "video", size: "L" } },
  { id: "led-wall", tags: { type: "video", size: "L" } },

  // ceiling — type=ceiling
  { id: "spotlight", tags: { type: "ceiling" } },
  { id: "disco-ball", tags: { type: "ceiling" } },
  { id: "neon-ring", tags: { type: "ceiling" } },

  // small decor — type=decor, size=S
  { id: "plant", tags: { type: "decor", size: "S" } },
  { id: "trophy", tags: { type: "decor", size: "S" } },
  { id: "speaker", tags: { type: "decor", size: "S" } },
  { id: "boombox", tags: { type: "decor", size: "S" } },
];

export function catalogItemById(id: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.id === id);
}
