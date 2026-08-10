import { CURRENT_VERSION } from "./migrate.ts";
import type { DecorationSnapshot, RoomTemplate } from "./types.ts";

// Room geometry + seed decorations. Pure domain data (spot frames, layers,
// accept rules) shared between the mobile client and — later — the backend that
// persists and validates decorations. Presentation-only theme art (background
// image / fill color) is NOT here; it stays in the mobile app (see
// apps/mobile/.../data/templates.ts), so this file carries no expo/RN imports.

// Fixed design canvas that spot frames are authored against (design §9.1).
// Frames are stored NORMALIZED (0..1); the stage scales this canvas uniformly
// to fit the device and letterboxes the remainder. The canvas ratio (~2.164)
// matches the room background art (852x1846 ~ 2.167) so the painted room and
// the spot grid cover-scale together with no drift.
export const DESIGN_CANVAS = { width: 390, height: 844 } as const;

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
    // Base pulled back to the wall/floor line (~0.75) so it reads as standing
    // against the back-left wall, not out on the floor beside the mat.
    {
      id: "tall-module",
      frame: { x: 0.04, y: 0.31, w: 0.24, h: 0.44 },
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
    // system / storage). Bottom-anchored to sit on the floor. Base pulled back to
    // the wall/floor line (~0.72) so the console sits against the back wall
    // behind the dance floor rather than overlapping its back edge.
    {
      id: "low-module",
      frame: { x: 0.3, y: 0.42, w: 0.4, h: 0.3 },
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
    // 5. Lounge Kit — foreground seating on the right-hand wood, facing the dance
    // floor. Sits low in the near foreground (drawn over the mat's front-right
    // corner by its higher layer) so it reads as a lounge in front of the floor,
    // not crammed beside it. Bottom-anchored to the floor.
    {
      id: "lounge-kit",
      frame: { x: 0.58, y: 0.59, w: 0.4, h: 0.36 },
      layer: 50,
      anchor: "bottom",
      accept: { kind: "tags", require: { type: "lounge" } },
    },
    // 9. Small Decor — three scattered floor slots, drawn last (frontmost) and
    // grounded to the floor. The dance floor (floor-main) covers the room's
    // center, and the left side is taken by the tall module + lounge kit, so the
    // decor slots live on the bare wood to the RIGHT of and BEHIND the mat — a
    // plant must never sit on the glowing dance surface. The lounge kit now owns
    // the right foreground, so the plants gather as a small cluster on the bare
    // wood in the front-LEFT corner (in front of / beside the tall module),
    // receding in depth: decor-1 back, decor-3 middle, decor-2 front.
    {
      id: "decor-1",
      frame: { x: 0.06, y: 0.7, w: 0.11, h: 0.14 },
      layer: 60,
      anchor: "bottom",
      accept: { kind: "tags", require: { type: "decor", size: "S" } },
    },
    {
      id: "decor-2",
      frame: { x: 0.04, y: 0.75, w: 0.13, h: 0.17 },
      layer: 62,
      anchor: "bottom",
      accept: { kind: "tags", require: { type: "decor", size: "S" } },
    },
    {
      id: "decor-3",
      frame: { x: 0.12, y: 0.73, w: 0.11, h: 0.15 },
      layer: 61,
      anchor: "bottom",
      accept: { kind: "tags", require: { type: "decor", size: "S" } },
    },
  ],
};

export function templateById(id: string): RoomTemplate | undefined {
  return id === ROOM_TEMPLATE.id ? ROOM_TEMPLATE : undefined;
}

/**
 * An empty starting decoration for a fresh room. Used as the first-run default
 * (see the mobile state/atoms) so a brand-new owner starts from scratch, and as
 * the fallback for corrupt or foreign persisted data.
 */
export function emptyDecoration(templateId: string = DEFAULT_TEMPLATE_ID): DecorationSnapshot {
  return { version: CURRENT_VERSION, templateId, map: {} };
}
