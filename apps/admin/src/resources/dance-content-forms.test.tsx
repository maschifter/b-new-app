import { describe, expect, it } from "vitest";
import { DanceGenreEdit } from "./dance-genres/genre-edit";
import { danceGenreEditableFields } from "./dance-genres/genre-form";
import { DanceMoveEdit } from "./dance-moves/move-edit";
import { danceMoveEditableFields, validateDanceMove } from "./dance-moves/move-form";
import { MusicTrackEdit } from "./music-tracks/track-edit";
import { musicTrackEditableFields } from "./music-tracks/track-form";

const serverFields = {
  id: "11111111-1111-4111-8111-111111111111",
  legacy_id: "legacy-id",
  created_at: "2026-08-26T00:00:00.000Z",
  updated_at: "2026-08-26T00:00:00.000Z",
};

describe("dance content admin forms", () => {
  it("strips server-managed fields from genre edits", () => {
    expect(
      danceGenreEditableFields({
        ...serverFields,
        name: "Hip Hop",
        status: "published",
        sort_order: 2,
      }),
    ).toEqual({ name: "Hip Hop", status: "published", sort_order: 2 });
  });

  it("strips server-managed fields from track edits", () => {
    const transformed = musicTrackEditableFields({
      ...serverFields,
      title: "Track",
      artist: null,
      audio_url: "https://example.com/track.mp3",
      delay_before_avatar_dance: 2_500,
      thumbnail_url: null,
      status: "draft",
      sort_order: 3,
    });

    expect(transformed).toMatchObject({
      delay_before_avatar_dance: 2_500,
    });
    expect(transformed).not.toHaveProperty("id");
  });

  it("keeps genre ids while stripping server-managed fields from move edits", () => {
    const transformed = danceMoveEditableFields({
      ...serverFields,
      title: "Move",
      level: 2,
      genre_ids: ["22222222-2222-4222-8222-222222222222"],
      status: "draft",
      sort_order: 4,
    });

    expect(transformed).not.toHaveProperty("id");
    expect(transformed.genre_ids).toEqual(["22222222-2222-4222-8222-222222222222"]);
  });

  it("requires pro dancer and dancer tip videos", () => {
    expect(validateDanceMove({})).toEqual({
      pro_dancer_video_url: "A dance move requires a pro dancer video URL",
      dancer_tip_video_url: "A dance move requires a dancer tip video URL",
    });
    expect(
      validateDanceMove({
        pro_dancer_video_url: "https://example.com/pro.mp4",
        dancer_tip_video_url: "https://example.com/tip.mp4",
      }),
    ).toEqual({});
  });

  it("waits for records before mounting edit fields", () => {
    expect(DanceGenreEdit().props.emptyWhileLoading).toBe(true);
    expect(MusicTrackEdit().props.emptyWhileLoading).toBe(true);
    expect(DanceMoveEdit().props.emptyWhileLoading).toBe(true);
  });
});
