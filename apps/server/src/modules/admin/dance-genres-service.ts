import type { AdminDanceGenre, DanceContentStatus, Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyInstance } from "fastify";
import { pickDefined } from "../../lib/pick-defined.js";
import {
  type CreateDanceGenreBody,
  DANCE_GENRE_UPDATE_COLUMNS,
  type UpdateDanceGenreBody,
} from "./dance-content-schemas.js";

const COLUMNS = "id, legacy_id, name, status, sort_order, created_at, updated_at";
const SORTABLE_COLUMNS = new Set([
  "id",
  "name",
  "status",
  "sort_order",
  "created_at",
  "updated_at",
]);

type HttpErrors = FastifyInstance["httpErrors"];

interface ListDanceGenresOptions {
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

function toAdminGenre(row: Database["public"]["Tables"]["dance_genres"]["Row"]): AdminDanceGenre {
  return { ...row, status: normalizeStatus(row.status) };
}

function genreUpdate(body: UpdateDanceGenreBody) {
  return pickDefined(body, DANCE_GENRE_UPDATE_COLUMNS);
}

export function createAdminDanceGenresService(
  supabase: SupabaseClient<Database>,
  httpErrors: HttpErrors,
) {
  return {
    async list(options: ListDanceGenresOptions) {
      if (options.ids?.length === 0) return { rows: [], total: 0 };
      const sortColumn = SORTABLE_COLUMNS.has(options.sort) ? options.sort : "sort_order";
      let query = supabase
        .from("dance_genres")
        .select(COLUMNS, { count: "exact" })
        .order(sortColumn, { ascending: options.order === "asc" });

      if (options.ids) query = query.in("id", options.ids);
      else query = query.range(options.start, Math.max(options.end - 1, options.start));
      const search = options.q?.replace(/[,%]/g, "").trim();
      if (search) query = query.ilike("name", `%${search}%`);
      if (options.status) query = query.eq("status", options.status);

      const { data, error, count } = await query;
      if (error) throw httpErrors.internalServerError("Could not load dance genres");
      const rows = (data ?? []).map(toAdminGenre);
      return { rows, total: options.ids ? rows.length : (count ?? rows.length) };
    },

    async get(id: string) {
      const { data, error } = await supabase
        .from("dance_genres")
        .select(COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw httpErrors.internalServerError("Could not load dance genre");
      if (!data) throw httpErrors.notFound("Dance genre not found");
      return toAdminGenre(data);
    },

    async create(body: CreateDanceGenreBody) {
      const { data, error } = await supabase
        .from("dance_genres")
        .insert(body)
        .select(COLUMNS)
        .single();
      if (error || !data) throw httpErrors.internalServerError("Could not create dance genre");
      return toAdminGenre(data);
    },

    async update(id: string, body: UpdateDanceGenreBody) {
      const { data, error } = await supabase
        .from("dance_genres")
        .update(genreUpdate(body))
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw httpErrors.internalServerError("Could not update dance genre");
      if (!data) throw httpErrors.notFound("Dance genre not found");
      return toAdminGenre(data);
    },

    async delete(id: string) {
      const { data, error } = await supabase
        .from("dance_genres")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw httpErrors.internalServerError("Could not delete dance genre");
      if (!data) throw httpErrors.notFound("Dance genre not found");
      return data;
    },
  };
}
