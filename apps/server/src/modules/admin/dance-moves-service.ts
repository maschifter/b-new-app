import type { AdminDanceMove, DanceContentStatus, Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyInstance } from "fastify";
import { pickDefined } from "../../lib/pick-defined.js";
import {
  type CreateDanceMoveBody,
  DANCE_MOVE_UPDATE_COLUMNS,
  DANCER_TIP_VIDEO_ERROR,
  PRO_DANCER_VIDEO_ERROR,
  type UpdateDanceMoveBody,
} from "./dance-content-schemas.js";

const MOVE_COLUMNS =
  "id, legacy_id, title, description, level, bpm, thumbnail_url, main_video_url, pro_dancer_video_url, pro_dancer_image_url, dancer_tip_video_url, dancer_tip_image_url, presentation_video_url, film_yourself_video_url, music_id, status, sort_order, created_at, updated_at";
const MOVE_WITH_GENRES =
  "id, legacy_id, title, description, level, bpm, thumbnail_url, main_video_url, pro_dancer_video_url, pro_dancer_image_url, dancer_tip_video_url, dancer_tip_image_url, presentation_video_url, film_yourself_video_url, music_id, status, sort_order, created_at, updated_at, dance_move_genres(genre_id)";
const MOVE_WITH_GENRES_AND_FILTER =
  "id, legacy_id, title, description, level, bpm, thumbnail_url, main_video_url, pro_dancer_video_url, pro_dancer_image_url, dancer_tip_video_url, dancer_tip_image_url, presentation_video_url, film_yourself_video_url, music_id, status, sort_order, created_at, updated_at, dance_move_genres(genre_id), filter:dance_move_genres!inner(genre_id)";
const SORTABLE_COLUMNS = new Set([
  "id",
  "title",
  "level",
  "status",
  "sort_order",
  "created_at",
  "updated_at",
]);
const FOREIGN_KEY_VIOLATION = "23503";
const UNKNOWN_REFERENCE_ERROR = "Unknown music track or genre";

type HttpErrors = FastifyInstance["httpErrors"];
type DanceMoveRow = Database["public"]["Tables"]["dance_moves"]["Row"];
type DanceMoveWithGenres = DanceMoveRow & {
  dance_move_genres: Array<{ genre_id: string }>;
  filter?: Array<{ genre_id: string }>;
};

interface ListDanceMovesOptions {
  start: number;
  end: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  status?: DanceContentStatus;
  level?: number;
  genreId?: string;
  musicId?: string;
  ids?: string[];
}

function normalizeStatus(value: string): DanceContentStatus {
  if (value === "draft" || value === "published") return value;
  throw new Error(`Unexpected dance content status: ${value}`);
}

function toAdminMove(row: DanceMoveWithGenres): AdminDanceMove {
  const { dance_move_genres, filter: _filter, status, ...move } = row;
  return {
    ...move,
    status: normalizeStatus(status),
    genre_ids: dance_move_genres.map(({ genre_id }) => genre_id),
  };
}

function moveUpdate(body: UpdateDanceMoveBody) {
  return pickDefined(body, DANCE_MOVE_UPDATE_COLUMNS);
}

function validateRequiredVideos(
  current: AdminDanceMove,
  body: UpdateDanceMoveBody,
  httpErrors: HttpErrors,
) {
  if (!(body.pro_dancer_video_url ?? current.pro_dancer_video_url)) {
    throw httpErrors.badRequest(PRO_DANCER_VIDEO_ERROR);
  }
  if (!(body.dancer_tip_video_url ?? current.dancer_tip_video_url)) {
    throw httpErrors.badRequest(DANCER_TIP_VIDEO_ERROR);
  }
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

export function createAdminDanceMovesService(
  supabase: SupabaseClient<Database>,
  httpErrors: HttpErrors,
) {
  async function get(id: string): Promise<AdminDanceMove> {
    const { data, error } = await supabase
      .from("dance_moves")
      .select(MOVE_WITH_GENRES)
      .eq("id", id)
      .maybeSingle();
    if (error) throw httpErrors.internalServerError("Could not load dance move");
    if (!data) throw httpErrors.notFound("Dance move not found");
    return toAdminMove(data);
  }

  async function validateGenres(genreIds: string[]) {
    const ids = uniqueIds(genreIds);
    if (ids.length === 0) return ids;
    const { data, error } = await supabase.from("dance_genres").select("id").in("id", ids);
    if (error) throw httpErrors.internalServerError("Could not validate dance genres");
    if ((data ?? []).length !== ids.length) throw httpErrors.badRequest(UNKNOWN_REFERENCE_ERROR);
    return ids;
  }

  async function replaceGenres(moveId: string, requestedIds: string[]) {
    const genreIds = uniqueIds(requestedIds);
    const { data, error } = await supabase
      .from("dance_move_genres")
      .select("genre_id")
      .eq("dance_move_id", moveId);
    if (error) throw httpErrors.internalServerError("Could not load dance move genres");

    const existing = new Set((data ?? []).map(({ genre_id }) => genre_id));
    const requested = new Set(genreIds);
    const added = genreIds.filter((genreId) => !existing.has(genreId));
    const removed = [...existing].filter((genreId) => !requested.has(genreId));

    if (added.length > 0) {
      const { error: insertError } = await supabase
        .from("dance_move_genres")
        .insert(added.map((genre_id) => ({ dance_move_id: moveId, genre_id })));
      if (insertError) throw httpErrors.badRequest(UNKNOWN_REFERENCE_ERROR);
    }
    if (removed.length > 0) {
      const { error: deleteError } = await supabase
        .from("dance_move_genres")
        .delete()
        .eq("dance_move_id", moveId)
        .in("genre_id", removed);
      if (deleteError) throw httpErrors.badRequest(UNKNOWN_REFERENCE_ERROR);
    }
  }

  return {
    async list(options: ListDanceMovesOptions) {
      if (options.ids?.length === 0) return { rows: [], total: 0 };
      const sortColumn = SORTABLE_COLUMNS.has(options.sort) ? options.sort : "sort_order";
      const baseQuery = supabase.from("dance_moves");
      let query = (
        options.genreId
          ? baseQuery.select(MOVE_WITH_GENRES_AND_FILTER, { count: "exact" })
          : baseQuery.select(MOVE_WITH_GENRES, { count: "exact" })
      ).order(sortColumn, { ascending: options.order === "asc" });

      if (options.ids) query = query.in("id", options.ids);
      else query = query.range(options.start, Math.max(options.end - 1, options.start));
      const search = options.q?.replace(/[,%]/g, "").trim();
      if (search) query = query.ilike("title", `%${search}%`);
      if (options.status) query = query.eq("status", options.status);
      if (options.level !== undefined) query = query.eq("level", options.level);
      if (options.musicId) query = query.eq("music_id", options.musicId);
      if (options.genreId) query = query.eq("filter.genre_id", options.genreId);

      const { data, error, count } = await query;
      if (error) throw httpErrors.internalServerError("Could not load dance moves");
      const rows = (data ?? []).map(toAdminMove);
      return { rows, total: options.ids ? rows.length : (count ?? rows.length) };
    },

    get,

    async create(body: CreateDanceMoveBody) {
      const genreIds = await validateGenres(body.genre_ids);
      const { genre_ids: _genreIds, ...payload } = body;
      const { data, error } = await supabase
        .from("dance_moves")
        .insert(payload)
        .select(MOVE_COLUMNS)
        .single();
      if (error?.code === FOREIGN_KEY_VIOLATION) {
        throw httpErrors.badRequest(UNKNOWN_REFERENCE_ERROR);
      }
      if (error || !data) throw httpErrors.internalServerError("Could not create dance move");

      if (genreIds.length > 0) {
        const { error: joinError } = await supabase
          .from("dance_move_genres")
          .insert(genreIds.map((genre_id) => ({ dance_move_id: data.id, genre_id })));
        if (joinError) {
          await supabase.from("dance_moves").delete().eq("id", data.id);
          throw httpErrors.badRequest(UNKNOWN_REFERENCE_ERROR);
        }
      }
      return get(data.id);
    },

    async update(id: string, body: UpdateDanceMoveBody) {
      const current = await get(id);
      validateRequiredVideos(current, body, httpErrors);
      const fields = moveUpdate(body);
      if (Object.keys(fields).length > 0) {
        const { data, error } = await supabase
          .from("dance_moves")
          .update(fields)
          .eq("id", id)
          .select("id")
          .maybeSingle();
        if (error?.code === FOREIGN_KEY_VIOLATION) {
          throw httpErrors.badRequest(UNKNOWN_REFERENCE_ERROR);
        }
        if (error) throw httpErrors.internalServerError("Could not update dance move");
        if (!data) throw httpErrors.notFound("Dance move not found");
      }
      if (body.genre_ids) await replaceGenres(id, body.genre_ids);
      return get(id);
    },

    async delete(id: string) {
      const { data, error } = await supabase
        .from("dance_moves")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw httpErrors.internalServerError("Could not delete dance move");
      if (!data) throw httpErrors.notFound("Dance move not found");
      return data;
    },
  };
}
