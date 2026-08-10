import { CURRENT_VERSION } from "../domain/migrate";
import type { DecorationSnapshot, RoomTemplate } from "../domain/types";

// Fixed design canvas that spot frames are authored against (design §9.1).
// Frames are stored NORMALIZED (0..1); the stage scales this canvas uniformly
// to fit the device and letterboxes the remainder.
export const DESIGN_CANVAS = { width: 390, height: 844 } as const;

// Flat placeholder backgrounds per theme (no real art this stage).
export const THEME_BACKGROUNDS: Record<string, string> = {
  "studio-dark": "#17171D",
};

// One room, one spot per design module (design § "DANCE STUDIO" legend): a
// hero screen with a stacked preview column, a tall module and wall art on the
// left, a low module (DJ booth / sound system) under the hero, a lounge kit and
// floor on the ground, ceiling lights up top, and three scattered small-decor
// slots. Layers are sparse integers so future inserts need no renumbering
// (design decision) and encode front-to-back draw order: floor sits behind
// furniture, decor draws last. Frames are hand-placed on the 390x844 canvas.
export const DEFAULT_TEMPLATE_ID = "studio-room-1";

export const ROOM_TEMPLATE: RoomTemplate = {
  id: DEFAULT_TEMPLATE_ID,
  themeId: "studio-dark",
  spots: [
    // 7. Floor Module — the ground plane, drawn first (furthest back). Spans the
    // full width and bleeds past the canvas bottom (x/y/w/h reach the edges) so
    // the floor reaches every screen edge under the cover scaling instead of
    // leaving margins; the lounge kit and small decor sit on top of it.
    {
      id: "floor-main",
      frame: { x: 0, y: 0.62, w: 1, h: 0.42 },
      layer: 10,
      accept: { kind: "tags", require: { type: "floor", size: "L" } },
    },
    // 8. Wall Art — upper-left wall.
    {
      id: "wall-art",
      frame: { x: 0.06, y: 0.11, w: 0.18, h: 0.13 },
      layer: 20,
      accept: { kind: "tags", require: { type: "wall", size: "M" } },
    },
    // 3. Tall Module — left column below the wall art (locker / trophies).
    {
      id: "tall-module",
      frame: { x: 0.06, y: 0.26, w: 0.18, h: 0.34 },
      layer: 22,
      accept: { kind: "tags", require: { type: "tall", size: "L" } },
    },
    // 1. Hero Video Zone — big center screen.
    {
      id: "hero-screen",
      frame: { x: 0.28, y: 0.11, w: 0.4, h: 0.26 },
      layer: 30,
      accept: { kind: "tags", require: { type: "video", size: "L" } },
    },
    // 2. Preview Zone — two smaller screens stacked to the right of the hero.
    {
      id: "preview-1",
      frame: { x: 0.71, y: 0.11, w: 0.22, h: 0.12 },
      layer: 32,
      accept: { kind: "tags", require: { type: "preview", size: "S" } },
    },
    {
      id: "preview-2",
      frame: { x: 0.71, y: 0.25, w: 0.22, h: 0.12 },
      layer: 32,
      accept: { kind: "tags", require: { type: "preview", size: "S" } },
    },
    // 4. Low Module — under the hero (DJ booth / sound system / storage).
    {
      id: "low-module",
      frame: { x: 0.28, y: 0.4, w: 0.4, h: 0.16 },
      layer: 34,
      accept: { kind: "tags", require: { type: "low", size: "M" } },
    },
    // 6. Ceiling — lights / disco ball up top.
    {
      id: "ceiling-light",
      frame: { x: 0.4, y: 0.02, w: 0.2, h: 0.07 },
      layer: 40,
      accept: { kind: "tags", require: { type: "ceiling" } },
    },
    // 5. Lounge Kit — lower-left seating on the floor.
    {
      id: "lounge-kit",
      frame: { x: 0.05, y: 0.62, w: 0.34, h: 0.24 },
      layer: 50,
      accept: { kind: "tags", require: { type: "lounge" } },
    },
    // 9. Small Decor — three scattered slots, drawn last (frontmost).
    {
      id: "decor-1",
      frame: { x: 0.72, y: 0.4, w: 0.14, h: 0.14 },
      layer: 60,
      accept: { kind: "tags", require: { type: "decor", size: "S" } },
    },
    {
      id: "decor-2",
      frame: { x: 0.44, y: 0.58, w: 0.12, h: 0.11 },
      layer: 60,
      accept: { kind: "tags", require: { type: "decor", size: "S" } },
    },
    {
      id: "decor-3",
      frame: { x: 0.74, y: 0.57, w: 0.14, h: 0.14 },
      layer: 60,
      accept: { kind: "tags", require: { type: "decor", size: "S" } },
    },
  ],
};

export function templateById(id: string): RoomTemplate | undefined {
  return id === ROOM_TEMPLATE.id ? ROOM_TEMPLATE : undefined;
}

/** An empty starting decoration for a fresh room (open question §8 #4 parked). */
export function emptyDecoration(templateId: string = DEFAULT_TEMPLATE_ID): DecorationSnapshot {
  return { version: CURRENT_VERSION, templateId, map: {} };
}

/**
 * A pre-decorated sample used by the first visible milestone (Phase 3) to prove
 * positioning and layer stacking before interaction exists. Not the runtime
 * default — the provider starts from `emptyDecoration()` when nothing is saved.
 */
export const SAMPLE_DECORATION: DecorationSnapshot = {
  version: CURRENT_VERSION,
  templateId: DEFAULT_TEMPLATE_ID,
  map: {
    "floor-main": { source: "catalog", id: "stage" },
    "hero-screen": { source: "catalog", id: "big-screen" },
    "preview-1": { source: "catalog", id: "preview-screen" },
    "tall-module": { source: "catalog", id: "trophy" },
    "low-module": { source: "catalog", id: "boombox" },
    "lounge-kit": { source: "catalog", id: "sofa" },
    "ceiling-light": { source: "catalog", id: "spotlight" },
    "wall-art": { source: "catalog", id: "mirror" },
    "decor-2": { source: "catalog", id: "plant" },
  },
};
