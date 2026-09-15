import type { CatalogItem, StudioCatalog } from "./types.ts";

// Seed catalog for the Foundation stage. Items have no art until an admin upload
// supplies a remote URL, so clients keep them visually hidden until then.
// Tags are the semantic matching keys consumed by `fits()`; presentation is
// derived separately so the domain stays art-free.
//
// The `type` taxonomy mirrors the design's nine studio modules (design §
// "DANCE STUDIO" module legend):
//   video   — Hero Video Zone   (big screen for the main video)
//   preview — Preview Zone      (2–3 smaller screens for other videos)
//   tall    — Tall Module       (locker / shoes / costumes / snack bar / trophies)
//   low     — Low Module        (DJ booth / sound system / trophy display / storage)
//   lounge  — Lounge Kit        (sofa / table / rug / pouf)
//   ceiling — Ceiling           (lights / disco ball / LED strips)
//   floor   — Floor Module      (rug / dance floor / mats / neon circle)
//   wall    — Wall Art          (posters / neon signs / mirrors / moodboards)
//   decor   — Small Decor       (plants / skateboard / basketball / bottles)
//
// `type=video`/`type=preview` items are screen metadata here; real
// per-user video (source "video", UGC) is a later stage.

export const CATALOG: CatalogItem[] = [
  // 1. Hero Video Zone — type=video, size=L
  { id: "big-screen", tags: { type: "video", size: "L" } },
  { id: "big-screen-2", tags: { type: "video", size: "L" } },
  { id: "led-wall", tags: { type: "video", size: "L" } },

  // 2. Preview Zone — type=preview, size=S (smaller companion screens)
  { id: "preview-screen", tags: { type: "preview", size: "S" } },
  { id: "preview-screen-2", tags: { type: "preview", size: "S" } },

  // 3. Tall Module — type=tall, size=L
  { id: "locker", tags: { type: "tall", size: "L" } },
  { id: "shoe-rack", tags: { type: "tall", size: "L" } },
  { id: "costume-rack", tags: { type: "tall", size: "L" } },
  { id: "snack-bar", tags: { type: "tall", size: "L" } },
  { id: "trophy", tags: { type: "tall", size: "L" } },
  { id: "trophy-2", tags: { type: "tall", size: "L" } },

  // 4. Low Module — type=low, size=M (DJ booth / sound system / storage)
  { id: "dj-booth", tags: { type: "low", size: "M" } },
  { id: "speaker", tags: { type: "low", size: "M" } },
  { id: "boombox", tags: { type: "low", size: "M" } },
  { id: "boombox-2", tags: { type: "low", size: "M" } },
  { id: "storage", tags: { type: "low", size: "M" } },

  // 5. Lounge Kit — type=lounge
  { id: "sofa", tags: { type: "lounge" } },
  { id: "sofa-2", tags: { type: "lounge" } },
  { id: "coffee-table", tags: { type: "lounge" } },
  { id: "pouf", tags: { type: "lounge" } },

  // 6. Ceiling — type=ceiling
  { id: "spotlight", tags: { type: "ceiling" } },
  { id: "spotlight-2", tags: { type: "ceiling" } },
  { id: "disco-ball", tags: { type: "ceiling" } },
  { id: "neon-ring", tags: { type: "ceiling" } },

  // 7. Floor Module — type=floor, size=L
  { id: "rug", tags: { type: "floor", size: "L" } },
  { id: "stage", tags: { type: "floor", size: "L" } },
  { id: "stage-2", tags: { type: "floor", size: "L" } },
  { id: "dance-mat", tags: { type: "floor", size: "L" } },
  { id: "neon-circle", tags: { type: "floor", size: "L" } },

  // 8. Wall Art — type=wall, size=M
  { id: "poster", tags: { type: "wall", size: "M" } },
  { id: "mirror", tags: { type: "wall", size: "M" } },
  { id: "mirror-2", tags: { type: "wall", size: "M" } },
  { id: "neon-sign", tags: { type: "wall", size: "M" } },
  { id: "moodboard", tags: { type: "wall", size: "M" } },

  // 9. Small Decor — type=decor, size=S
  { id: "plant", tags: { type: "decor", size: "S" } },
  { id: "plant-2", tags: { type: "decor", size: "S" } },
  { id: "skateboard", tags: { type: "decor", size: "S" } },
  { id: "basketball", tags: { type: "decor", size: "S" } },
  { id: "water-bottle", tags: { type: "decor", size: "S" } },
];

export function catalogItemById(id: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.id === id);
}

/** Convert a catalog slug such as "big-screen" into its default display name. */
export function defaultItemLabel(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * The bundled seed as a publishable catalog: every item free and published, named
 * from its slug. Version 0 so any server catalog outranks it. Used wherever the real
 * catalog is unavailable — a cold start, or a failed read — so the room still renders.
 */
export function fallbackCatalog(): StudioCatalog {
  return {
    version: 0,
    items: CATALOG.map((item) => ({
      ...item,
      name: defaultItemLabel(item.id),
      status: "published",
      access: "free",
    })),
  };
}
