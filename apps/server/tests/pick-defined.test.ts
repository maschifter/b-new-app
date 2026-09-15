import { describe, expect, it } from "vitest";

import { pickDefined } from "../src/lib/pick-defined.js";
import {
  CATALOG_ITEM_UPDATE_COLUMNS,
  UpdateCatalogItemRequest,
} from "../src/modules/admin/catalog-schemas.js";
import {
  DANCE_GENRE_UPDATE_COLUMNS,
  DANCE_MOVE_UPDATE_COLUMNS,
  MUSIC_TRACK_UPDATE_COLUMNS,
  UpdateDanceGenreRequest,
  UpdateDanceMoveRequest,
  UpdateMusicTrackRequest,
} from "../src/modules/admin/dance-content-schemas.js";

describe("pickDefined", () => {
  it("omits keys the source does not carry", () => {
    const picked = pickDefined({ a: 1 } as { a: number; b?: number }, ["a", "b"]);
    expect(picked).toEqual({ a: 1 });
    expect("b" in picked).toBe(false);
  });

  it("drops keys set to an explicit undefined", () => {
    const picked = pickDefined({ a: 1, b: undefined }, ["a", "b"]);
    expect(picked).toEqual({ a: 1 });
    expect("b" in picked).toBe(false);
  });

  it("preserves an explicit null, which clears the column", () => {
    const picked = pickDefined({ a: 1, b: null }, ["a", "b"]);
    expect(picked).toEqual({ a: 1, b: null });
    expect("b" in picked).toBe(true);
  });

  it("copies only the listed keys", () => {
    const picked = pickDefined({ a: 1, b: 2, c: 3 }, ["a", "c"]);
    expect(picked).toEqual({ a: 1, c: 3 });
  });

  it("returns an empty object when nothing is defined", () => {
    expect(pickDefined({ a: undefined }, ["a"])).toEqual({});
  });
});

// One sample per editable column, typed so that adding a field to an update schema
// fails to compile until this fixture — and therefore the column list driving the row
// update — covers it. Parsing with the strict schema catches the reverse drift: a
// column listed here that the request no longer accepts.
const GENRE_BODY = {
  name: "Hip Hop",
  status: "draft",
  sort_order: 1,
} satisfies Record<(typeof DANCE_GENRE_UPDATE_COLUMNS)[number], unknown>;

const TRACK_BODY = {
  title: "Night Drive",
  artist: "Neon",
  audio_url: "https://example.com/track.mp3",
  delay_before_avatar_dance: null,
  thumbnail_url: "https://example.com/track.webp",
  status: "draft",
  sort_order: 1,
} satisfies Record<(typeof MUSIC_TRACK_UPDATE_COLUMNS)[number], unknown>;

const CATALOG_BODY = {
  tags: { type: "decor", size: "S" },
  display_name: "New Plant",
  status: "draft",
  access: "free",
  price: null,
  sort_order: 1,
} satisfies Record<(typeof CATALOG_ITEM_UPDATE_COLUMNS)[number], unknown>;

const MOVE_BODY = {
  title: "Body Roll",
  description: null,
  level: 2,
  bpm: null,
  thumbnail_url: null,
  main_video_url: null,
  pro_dancer_video_url: "https://example.com/pro.mp4",
  pro_dancer_image_url: null,
  dancer_tip_video_url: "https://example.com/tip.mp4",
  dancer_tip_image_url: null,
  presentation_video_url: null,
  film_yourself_video_url: null,
  music_id: null,
  status: "draft",
  sort_order: 1,
} satisfies Record<(typeof DANCE_MOVE_UPDATE_COLUMNS)[number], unknown>;

describe("admin update column lists", () => {
  it.each([
    ["dance genre", DANCE_GENRE_UPDATE_COLUMNS, GENRE_BODY, UpdateDanceGenreRequest],
    ["music track", MUSIC_TRACK_UPDATE_COLUMNS, TRACK_BODY, UpdateMusicTrackRequest],
    ["catalog item", CATALOG_ITEM_UPDATE_COLUMNS, CATALOG_BODY, UpdateCatalogItemRequest],
    ["dance move", DANCE_MOVE_UPDATE_COLUMNS, MOVE_BODY, UpdateDanceMoveRequest],
  ])("lists exactly the editable %s columns", (_name, columns, body, schema) => {
    expect([...columns].sort()).toEqual(Object.keys(body).sort());
    expect(schema.parse(body)).toEqual(body);
  });

  it("keeps genre_ids out of the dance move columns, since it is a join table", () => {
    expect(UpdateDanceMoveRequest.parse({ genre_ids: [] })).toEqual({ genre_ids: [] });
    expect([...DANCE_MOVE_UPDATE_COLUMNS]).not.toContain("genre_ids");
  });
});
