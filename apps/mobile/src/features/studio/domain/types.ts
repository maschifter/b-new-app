// Domain contract for the dance studio. Copied from the design (§2.1) so this
// file is the single source of truth the rest of the feature builds against.
// Pure data shapes only — no UI, no storage, no React.

/** Tags are a flat bag; values are single- or multi-valued. */
export type Tags = Record<string, string | string[]>;

/**
 * A spot's accept rule is a predicate shape, not baked-in logic. Today it can
 * be the simplest AND-of-tags; it can grow to allow-lists without changing the
 * type. Evaluated by `fits()` (see fits.ts).
 */
export type AcceptRule =
  | { kind: "tags"; require: Tags } // e.g. { type: "floor", size: "L" }
  | { kind: "allow"; ids: string[] }; // explicit allow-list

/** The library of every placeable thing. Shared across all users. */
export interface CatalogItem {
  id: string;
  tags: Tags; // type, size, …
}

/** A fixed placement position in a room, defined by designers. */
export interface Spot {
  id: string;
  // Position is designer-authored but stored NORMALIZED (0..1) against a fixed
  // design canvas, never in device pixels (see design §9.1).
  frame: { x: number; y: number; w: number; h: number };
  layer: number; // fixed draw order
  accept: AcceptRule;
}

/** The set of spots for one kind of room, tied to a theme. Shared. */
export interface RoomTemplate {
  id: string;
  themeId: string;
  spots: Spot[];
}

/**
 * What a filled slot points at — kept generic so user video (UGC) can be added
 * later without changing the decoration map's shape.
 */
export type ContentRef = { source: "catalog"; id: string } | { source: "video"; id: string }; // user's dance clip (UGC), later stage

/** The whole per-user decoration: a tiny, versioned spot -> item map. */
export interface DecorationSnapshot {
  version: number;
  templateId: string;
  map: Record<string /* spotId */, ContentRef>;
}

/**
 * Who is viewing and what they can do (design §4). One rendering mechanism
 * serves all three; only "edit" allows assignment.
 */
export type StudioMode = "edit" | "preview" | "visit";
