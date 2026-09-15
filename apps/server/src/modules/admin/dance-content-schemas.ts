import type { DanceContentStatus } from "@bnewapp/types";
import { z } from "zod";

export const PRO_DANCER_VIDEO_ERROR = "A dance move requires a pro dancer video URL";
export const DANCER_TIP_VIDEO_ERROR = "A dance move requires a dancer tip video URL";

const status = z.enum(["draft", "published"]);

// Narrows the plain `text` status column Supabase reads back. The declared return
// type keeps the enum above and the shared DanceContentStatus from drifting apart.
export function parseDanceContentStatus(value: string): DanceContentStatus {
  const parsed = status.safeParse(value);
  if (!parsed.success) throw new Error(`Unexpected dance content status: ${value}`);
  return parsed.data;
}
const uuid = z.string().uuid();
const nullableUrl = z.string().trim().url().nullable();
const requiredUrl = z.string().trim().url();

const genreFields = z.object({
  name: z.string().trim().min(1).max(120),
  status,
  sort_order: z.number().int(),
});

const musicTrackFields = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200),
  audio_url: requiredUrl,
  delay_before_avatar_dance: z.number().int().nonnegative().nullable(),
  thumbnail_url: requiredUrl,
  status,
  sort_order: z.number().int(),
});

// Split from genre_ids because these are the dance_moves columns; genre_ids is
// written to the dance_move_genres join table instead.
const danceMoveColumns = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().nullable(),
  level: z.number().int().min(1),
  bpm: z.number().int().positive().nullable(),
  thumbnail_url: nullableUrl,
  main_video_url: nullableUrl,
  pro_dancer_video_url: requiredUrl,
  pro_dancer_image_url: nullableUrl,
  dancer_tip_video_url: requiredUrl,
  dancer_tip_image_url: nullableUrl,
  presentation_video_url: nullableUrl,
  film_yourself_video_url: nullableUrl,
  music_id: uuid.nullable(),
  status,
  sort_order: z.number().int(),
});

const danceMoveFields = danceMoveColumns.extend({
  genre_ids: z.array(uuid).max(500),
});

// Derived from the schemas above so a new editable field cannot be accepted by the
// request and then silently dropped from the row update.
export const DANCE_GENRE_UPDATE_COLUMNS = genreFields.keyof().options;
export const MUSIC_TRACK_UPDATE_COLUMNS = musicTrackFields.keyof().options;
export const DANCE_MOVE_UPDATE_COLUMNS = danceMoveColumns.keyof().options;

export const DanceContentIdParam = z.object({ id: uuid });

export const CreateDanceGenreRequest = genreFields.strict();
export const UpdateDanceGenreRequest = genreFields
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "No editable fields supplied" });

export const CreateMusicTrackRequest = musicTrackFields.strict();
export const UpdateMusicTrackRequest = musicTrackFields
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "No editable fields supplied" });

export const CreateDanceMoveRequest = danceMoveFields
  .extend({ genre_ids: z.array(uuid).max(500).default([]) })
  .strict();

export const UpdateDanceMoveRequest = danceMoveFields
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "No editable fields supplied" });

const ids = z.array(uuid).max(500);

export const DanceGenreListFilter = z.object({
  q: z.string().optional(),
  status: status.optional(),
  id: ids.optional(),
});

export const MusicTrackListFilter = z.object({
  q: z.string().optional(),
  status: status.optional(),
  id: ids.optional(),
});

export const DanceMoveListFilter = z.object({
  q: z.string().optional(),
  status: status.optional(),
  level: z.number().int().min(1).optional(),
  genre_id: uuid.optional(),
  music_id: uuid.optional(),
  id: ids.optional(),
});

export type CreateDanceGenreBody = z.infer<typeof CreateDanceGenreRequest>;
export type UpdateDanceGenreBody = z.infer<typeof UpdateDanceGenreRequest>;
export type CreateMusicTrackBody = z.infer<typeof CreateMusicTrackRequest>;
export type UpdateMusicTrackBody = z.infer<typeof UpdateMusicTrackRequest>;
export type CreateDanceMoveBody = z.infer<typeof CreateDanceMoveRequest>;
export type UpdateDanceMoveBody = z.infer<typeof UpdateDanceMoveRequest>;
