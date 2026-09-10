import { randomUUID } from "node:crypto";
import type { DanceMediaTarget, DanceMediaUploadTicket, Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyInstance } from "fastify";
import sharp, { type Metadata } from "sharp";
import type { DanceMediaImageQueryBody, DanceMediaUploadBody } from "./dance-media-schemas.js";

const BUCKET = "dance-media";
const MAX_INPUT_EDGE = 4096;

type MediaKind = "video" | "audio" | "image";
type Field = { kind: MediaKind; slug: string };
type HttpErrors = FastifyInstance["httpErrors"];

const FIELDS: Record<DanceMediaTarget, Record<string, Field>> = {
  move: {
    main_video_url: { kind: "video", slug: "main" },
    pro_dancer_video_url: { kind: "video", slug: "pro-dancer" },
    pro_dancer_image_url: { kind: "image", slug: "pro-dancer" },
    dancer_tip_video_url: { kind: "video", slug: "dancer-tip" },
    dancer_tip_image_url: { kind: "image", slug: "dancer-tip" },
    presentation_video_url: { kind: "video", slug: "presentation" },
    film_yourself_video_url: { kind: "video", slug: "film-yourself" },
    thumbnail_url: { kind: "image", slug: "thumbnail" },
  },
  track: {
    audio_url: { kind: "audio", slug: "audio" },
    thumbnail_url: { kind: "image", slug: "cover" },
  },
};

export class InvalidDanceMediaImageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidDanceMediaImageError";
  }
}

function fieldFor(target: DanceMediaTarget, name: string): Field | undefined {
  return FIELDS[target][name];
}

function extension(filename: string): string | undefined {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) return undefined;
  return filename.slice(lastDot + 1).toLowerCase();
}

function extensionContentType(kind: "video" | "audio", value: string): string | undefined {
  if (kind === "video") return value === "mp4" ? "video/mp4" : undefined;
  if (value === "mp3") return "audio/mpeg";
  if (value === "m4a") return "audio/mp4";
  return undefined;
}

function objectPath(
  target: DanceMediaTarget,
  recordId: string | undefined,
  slug: string,
  ext: string,
) {
  const prefix = target === "move" ? "moves" : "tracks";
  return `${prefix}/${recordId ?? randomUUID()}/${slug}-${Date.now()}.${ext}`;
}

async function ensureRecordExists(
  supabase: SupabaseClient<Database>,
  httpErrors: HttpErrors,
  target: DanceMediaTarget,
  recordId: string | undefined,
) {
  if (!recordId) return;
  const table = target === "move" ? "dance_moves" : "music_tracks";
  const { data, error } = await supabase.from(table).select("id").eq("id", recordId).maybeSingle();
  if (error) throw httpErrors.internalServerError("Could not verify dance media record");
  if (!data) throw httpErrors.notFound("Dance media record not found");
}

export async function processDanceMediaImage(input: Buffer, maxEdge: number): Promise<Buffer> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_EDGE ** 2,
    }).metadata();
  } catch (error) {
    throw new InvalidDanceMediaImageError("Invalid image file", { cause: error });
  }
  if (!metadata.format || !new Set(["jpeg", "png", "webp"]).has(metadata.format)) {
    throw new InvalidDanceMediaImageError("Image must be PNG, JPEG, or WEBP");
  }
  if (!metadata.width || !metadata.height) {
    throw new InvalidDanceMediaImageError("Image dimensions are missing");
  }
  if (metadata.width > MAX_INPUT_EDGE || metadata.height > MAX_INPUT_EDGE) {
    throw new InvalidDanceMediaImageError("Image dimensions must not exceed 4096px");
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new InvalidDanceMediaImageError("Animated images are not supported");
  }
  return sharp(input)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

export function createDanceMediaService(
  supabase: SupabaseClient<Database>,
  httpErrors: HttpErrors,
) {
  return {
    async createUploadTicket(body: DanceMediaUploadBody): Promise<DanceMediaUploadTicket> {
      const field = fieldFor(body.target, body.field);
      if (!field || field.kind === "image") {
        throw httpErrors.badRequest("Field does not accept video or audio uploads");
      }
      const ext = extension(body.filename);
      if (!ext) throw httpErrors.badRequest("Unsupported media file extension");
      const contentType = extensionContentType(field.kind, ext);
      if (!contentType) throw httpErrors.badRequest("Unsupported media file extension");

      await ensureRecordExists(supabase, httpErrors, body.target, body.recordId);
      const path = objectPath(body.target, body.recordId, field.slug, ext);
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw httpErrors.internalServerError("Could not create upload ticket");
      const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return { path, token: data.token, publicUrl: publicUrl.publicUrl, contentType };
    },

    async uploadImage(
      query: DanceMediaImageQueryBody,
      input: Buffer,
    ): Promise<{ publicUrl: string }> {
      const field = fieldFor(query.target, query.field);
      if (!field || field.kind !== "image") {
        throw httpErrors.badRequest("Field does not accept image uploads");
      }
      const bytes = await processDanceMediaImage(
        input,
        field.slug === "thumbnail" || field.slug === "cover" ? 800 : 1600,
      );
      await ensureRecordExists(supabase, httpErrors, query.target, query.recordId);
      const path = objectPath(query.target, query.recordId, field.slug, "webp");
      const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: "image/webp",
        cacheControl: "31536000, immutable",
        upsert: false,
      });
      if (error) throw httpErrors.internalServerError("Could not upload dance media image");
      const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return { publicUrl: publicUrl.publicUrl };
    },
  };
}
