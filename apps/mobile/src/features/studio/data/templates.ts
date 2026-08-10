import type { ImageSource } from "expo-image";
import { CURRENT_VERSION } from "../domain/migrate";
import type { DecorationSnapshot, RoomTemplate } from "../domain/types";

// Fixed design canvas that spot frames are authored against (design §9.1).
// Frames are stored NORMALIZED (0..1); the stage scales this canvas uniformly
// to fit the device and letterboxes the remainder. The canvas ratio (~2.164)
// matches the room background art (852x1846 ~ 2.167) so the painted room and
// the spot grid cover-scale together with no drift.
export const DESIGN_CANVAS = { width: 390, height: 844 } as const;

// Painted room background per theme — a full-bleed image whose perspective the
// spot frames are tuned against (floor line sits at y ~= 0.73). Drawn behind all
// spots and cover-scaled with the same math as the stage.
export const THEME_BACKGROUND_IMAGES: Record<string, ImageSource> = {
  "studio-dark": require("../../../../assets/studio/studio-background.png"),
};

// Flat fill shown behind the background image (while it loads / at its edges).
export const THEME_BACKGROUNDS: Record<string, string> = {
  "studio-dark": "#241436",
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
    // 7. Floor Module — a flat stage disc lying on the ground, drawn first
    // (furthest back). Centered on the floor plane; the wood floor line of the
    // background art sits at y ~= 0.73, so the disc straddles it and the
    // furniture and small decor sit in front of it. Centered anchor: it lies
    // flat, not standing, so it does not ground to a bottom edge.
    {
      id: "floor-main",
      frame: { x: 0.16, y: 0.66, w: 0.68, h: 0.3 },
      layer: 10,
      accept: { kind: "tags", require: { type: "floor", size: "L" } },
    },
    // 8. Wall Art — upper-left wall (tall mirror), mounted flat on the wall. Its
    // top aligns with the hero's top (below the ceiling), not jammed under it, so
    // it reads as the design's left-wall mirror. Frame AR (~0.33) matches the
    // trimmed mirror sprite so it fills the slot.
    {
      id: "wall-art",
      frame: { x: 0.035, y: 0.2, w: 0.17, h: 0.24 },
      layer: 20,
      accept: { kind: "tags", require: { type: "wall", size: "M" } },
    },
    // 3. Tall Module — left column standing on the floor (locker / trophies).
    // Bottom-anchored so its base meets the floor at the frame's bottom edge.
    {
      id: "tall-module",
      frame: { x: 0.04, y: 0.38, w: 0.24, h: 0.44 },
      layer: 22,
      anchor: "bottom",
      accept: { kind: "tags", require: { type: "tall", size: "L" } },
    },
    // 1. Hero Video Zone — big portrait screen, centered on the back wall
    // between the tall module (left) and the preview column (right). Sits below
    // the ceiling with breathing room (not jammed to the top). Frame AR (~0.47)
    // matches the trimmed portrait phone sprite so it fills the slot.
    {
      id: "hero-screen",
      frame: { x: 0.29, y: 0.15, w: 0.38, h: 0.37 },
      layer: 30,
      accept: { kind: "tags", require: { type: "video", size: "L" } },
    },
    // 2. Preview Zone — three small portrait screens stacked in the right column
    // (design shows three), kept compact so they occupy only the upper-right and
    // don't crowd the wall. Frame AR (~0.49) matches the preview sprite.
    {
      id: "preview-1",
      frame: { x: 0.72, y: 0.15, w: 0.16, h: 0.15 },
      layer: 32,
      accept: { kind: "tags", require: { type: "preview", size: "S" } },
    },
    {
      id: "preview-2",
      frame: { x: 0.72, y: 0.32, w: 0.16, h: 0.15 },
      layer: 32,
      accept: { kind: "tags", require: { type: "preview", size: "S" } },
    },
    {
      id: "preview-3",
      frame: { x: 0.72, y: 0.49, w: 0.16, h: 0.15 },
      layer: 32,
      accept: { kind: "tags", require: { type: "preview", size: "S" } },
    },
    // 4. Low Module — under the hero, standing on the floor (DJ booth / sound
    // system / storage). Bottom-anchored to sit on the floor.
    {
      id: "low-module",
      frame: { x: 0.3, y: 0.48, w: 0.4, h: 0.3 },
      layer: 34,
      anchor: "bottom",
      accept: { kind: "tags", require: { type: "low", size: "M" } },
    },
    // 6. Ceiling — light track / disco ball up top. Nudged down from the very
    // edge so the fixtures clear the status bar while the painted ceiling behind
    // still bleeds full to the top (see studio-screen full-bleed note).
    {
      id: "ceiling-light",
      frame: { x: 0.2, y: 0.04, w: 0.6, h: 0.12 },
      layer: 40,
      accept: { kind: "tags", require: { type: "ceiling" } },
    },
    // 5. Lounge Kit — lower-left seating standing on the floor, drawn in front
    // of the tall module. Bottom-anchored to the floor.
    {
      id: "lounge-kit",
      frame: { x: 0.04, y: 0.58, w: 0.4, h: 0.36 },
      layer: 50,
      anchor: "bottom",
      accept: { kind: "tags", require: { type: "lounge" } },
    },
    // 9. Small Decor — three scattered floor slots, drawn last (frontmost) and
    // grounded to the floor.
    {
      id: "decor-1",
      frame: { x: 0.8, y: 0.56, w: 0.17, h: 0.2 },
      layer: 60,
      anchor: "bottom",
      accept: { kind: "tags", require: { type: "decor", size: "S" } },
    },
    {
      id: "decor-2",
      frame: { x: 0.62, y: 0.58, w: 0.2, h: 0.22 },
      layer: 60,
      anchor: "bottom",
      accept: { kind: "tags", require: { type: "decor", size: "S" } },
    },
    {
      id: "decor-3",
      frame: { x: 0.44, y: 0.6, w: 0.16, h: 0.18 },
      layer: 60,
      anchor: "bottom",
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
 * A pre-decorated sample: one item per module, each mapped to an id that has real
 * bundled art (see ./ui/art). Used as the first-run default (see state/atoms) so a
 * brand-new owner opens onto the fully-illustrated reference studio; the owner's
 * first edit overwrites it. `emptyDecoration()` remains the fallback for corrupt
 * or foreign persisted data.
 */
export const SAMPLE_DECORATION: DecorationSnapshot = {
  version: CURRENT_VERSION,
  templateId: DEFAULT_TEMPLATE_ID,
  map: {
    "floor-main": { source: "catalog", id: "stage" },
    "hero-screen": { source: "catalog", id: "big-screen" },
    "preview-1": { source: "catalog", id: "preview-screen" },
    "preview-2": { source: "catalog", id: "preview-screen" },
    "preview-3": { source: "catalog", id: "preview-screen" },
    "tall-module": { source: "catalog", id: "trophy" },
    "low-module": { source: "catalog", id: "boombox" },
    "lounge-kit": { source: "catalog", id: "sofa" },
    "ceiling-light": { source: "catalog", id: "spotlight" },
    "wall-art": { source: "catalog", id: "mirror" },
    "decor-2": { source: "catalog", id: "plant" },
  },
};
