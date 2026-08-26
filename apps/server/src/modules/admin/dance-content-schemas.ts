import { z } from "zod";

export const PUBLISHED_MOVE_VIDEO_ERROR = "A published move requires a main video URL";

const status = z.enum(["draft", "published"]);
const uuid = z.string().uuid();
const nullableUrl = z.string().trim().url().nullable();

const genreFields = z.object({
  name: z.string().trim().min(1).max(120),
  status,
  sort_order: z.number().int(),
});

const musicTrackFields = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().nullable(),
  audio_url: z.string().trim().url(),
  thumbnail_url: nullableUrl,
  status,
  sort_order: z.number().int(),
});

const danceMoveFields = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().nullable(),
  level: z.number().int().min(1),
  bpm: z.number().int().positive().nullable(),
  thumbnail_url: nullableUrl,
  main_video_url: nullableUrl,
  pro_dancer_video_url: nullableUrl,
  pro_dancer_image_url: nullableUrl,
  dancer_tip_video_url: nullableUrl,
  dancer_tip_image_url: nullableUrl,
  presentation_video_url: nullableUrl,
  film_yourself_video_url: nullableUrl,
  music_id: uuid.nullable(),
  genre_ids: z.array(uuid).max(500),
  status,
  sort_order: z.number().int(),
});

function hasPublishedVideo(value: {
  status?: "draft" | "published" | undefined;
  main_video_url?: string | null | undefined;
}) {
  return value.status !== "published" || Boolean(value.main_video_url);
}

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
  .strict()
  .refine(hasPublishedVideo, { message: PUBLISHED_MOVE_VIDEO_ERROR });

export const UpdateDanceMoveRequest = danceMoveFields
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "No editable fields supplied" })
  .refine(
    (body) =>
      body.status !== "published" ||
      body.main_video_url === undefined ||
      Boolean(body.main_video_url),
    { message: PUBLISHED_MOVE_VIDEO_ERROR },
  );

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
