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

// One room, 7 spots. Layers are sparse integers so future inserts need no
// renumbering (design decision). Frames are hand-placed on the 390x844 canvas.
export const DEFAULT_TEMPLATE_ID = "studio-room-1";

export const ROOM_TEMPLATE: RoomTemplate = {
  id: DEFAULT_TEMPLATE_ID,
  themeId: "studio-dark",
  spots: [
    {
      id: "floor-main",
      frame: { x: 0.08, y: 0.62, w: 0.84, h: 0.3 },
      layer: 10,
      accept: { kind: "tags", require: { type: "floor", size: "L" } },
    },
    {
      id: "wall-art",
      frame: { x: 0.06, y: 0.16, w: 0.2, h: 0.24 },
      layer: 20,
      accept: { kind: "tags", require: { type: "wall", size: "M" } },
    },
    {
      id: "hero-screen",
      frame: { x: 0.3, y: 0.12, w: 0.42, h: 0.28 },
      layer: 30,
      accept: { kind: "tags", require: { type: "video", size: "L" } },
    },
    {
      id: "ceiling-light",
      frame: { x: 0.42, y: 0.02, w: 0.16, h: 0.08 },
      layer: 40,
      accept: { kind: "tags", require: { type: "ceiling" } },
    },
    {
      id: "decor-1",
      frame: { x: 0.1, y: 0.48, w: 0.14, h: 0.16 },
      layer: 50,
      accept: { kind: "tags", require: { type: "decor", size: "S" } },
    },
    {
      id: "decor-2",
      frame: { x: 0.43, y: 0.48, w: 0.14, h: 0.16 },
      layer: 50,
      accept: { kind: "tags", require: { type: "decor", size: "S" } },
    },
    {
      id: "decor-3",
      frame: { x: 0.76, y: 0.48, w: 0.14, h: 0.16 },
      layer: 50,
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
    "ceiling-light": { source: "catalog", id: "spotlight" },
    "decor-2": { source: "catalog", id: "trophy" },
  },
};
