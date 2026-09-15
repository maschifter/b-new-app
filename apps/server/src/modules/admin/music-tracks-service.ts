import type { AdminMusicTrack, DanceContentStatus, Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyInstance } from "fastify";
import type { CreateMusicTrackBody, UpdateMusicTrackBody } from "./dance-content-schemas.js";

const COLUMNS =
  "id, legacy_id, title, artist, audio_url, delay_before_avatar_dance, thumbnail_url, status, sort_order, created_at, updated_at";
const SORTABLE_COLUMNS = new Set([
  "id",
  "title",
  "artist",
  "status",
  "sort_order",
  "created_at",
  "updated_at",
]);
const FOREIGN_KEY_VIOLATION = "23503";

type HttpErrors = FastifyInstance["httpErrors"];

interface ListMusicTracksOptions {
  start: number;
  end: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  status?: DanceContentStatus;
  ids?: string[];
}

function normalizeStatus(value: string): DanceContentStatus {
  if (value === "draft" || value === "published") return value;
  throw new Error(`Unexpected dance content status: ${value}`);
}

function toAdminTrack(row: Database["public"]["Tables"]["music_tracks"]["Row"]): AdminMusicTrack {
  return { ...row, status: normalizeStatus(row.status) };
}

function trackUpdate(body: UpdateMusicTrackBody) {
  return {
    ...(body.title === undefined ? {} : { title: body.title }),
    ...(body.artist === undefined ? {} : { artist: body.artist }),
    ...(body.audio_url === undefined ? {} : { audio_url: body.audio_url }),
    ...(body.delay_before_avatar_dance === undefined
      ? {}
      : { delay_before_avatar_dance: body.delay_before_avatar_dance }),
    ...(body.thumbnail_url === undefined ? {} : { thumbnail_url: body.thumbnail_url }),
    ...(body.status === undefined ? {} : { status: body.status }),
    ...(body.sort_order === undefined ? {} : { sort_order: body.sort_order }),
  };
}

export function createAdminMusicTracksService(
  supabase: SupabaseClient<Database>,
  httpErrors: HttpErrors,
) {
  return {
    async list(options: ListMusicTracksOptions) {
      if (options.ids?.length === 0) return { rows: [], total: 0 };
      const sortColumn = SORTABLE_COLUMNS.has(options.sort) ? options.sort : "sort_order";
      let query = supabase
        .from("music_tracks")
        .select(COLUMNS, { count: "exact" })
        .order(sortColumn, { ascending: options.order === "asc" });

      if (options.ids) query = query.in("id", options.ids);
      else query = query.range(options.start, Math.max(options.end - 1, options.start));
      const search = options.q?.replace(/[,%]/g, "").trim();
      if (search) query = query.or(`title.ilike.%${search}%,artist.ilike.%${search}%`);
      if (options.status) query = query.eq("status", options.status);

      const { data, error, count } = await query;
      if (error) throw httpErrors.internalServerError("Could not load music tracks");
      const rows = (data ?? []).map(toAdminTrack);
      return { rows, total: options.ids ? rows.length : (count ?? rows.length) };
    },

    async get(id: string) {
      const { data, error } = await supabase
        .from("music_tracks")
        .select(COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw httpErrors.internalServerError("Could not load music track");
      if (!data) throw httpErrors.notFound("Music track not found");
      return toAdminTrack(data);
    },

    async create(body: CreateMusicTrackBody) {
      const { data, error } = await supabase
        .from("music_tracks")
        .insert(body)
        .select(COLUMNS)
        .single();
      if (error || !data) throw httpErrors.internalServerError("Could not create music track");
      return toAdminTrack(data);
    },

    async update(id: string, body: UpdateMusicTrackBody) {
      const { data, error } = await supabase
        .from("music_tracks")
        .update(trackUpdate(body))
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw httpErrors.internalServerError("Could not update music track");
      if (!data) throw httpErrors.notFound("Music track not found");
      return toAdminTrack(data);
    },

    async delete(id: string) {
      const { data, error } = await supabase
        .from("music_tracks")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error?.code === FOREIGN_KEY_VIOLATION) {
        throw httpErrors.conflict("Track is used by dance moves; detach or replace it first");
      }
      if (error) throw httpErrors.internalServerError("Could not delete music track");
      if (!data) throw httpErrors.notFound("Music track not found");
      return data;
    },
  };
}
