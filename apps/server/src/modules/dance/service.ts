import type { DanceGenre, DanceMove, DanceMovesPage, Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyInstance } from "fastify";
import type { DanceMovesCursor } from "./schemas.js";

const MOVE_SELECT =
  "id, title, description, level, bpm, thumbnail_url, main_video_url, pro_dancer_video_url, pro_dancer_image_url, dancer_tip_video_url, dancer_tip_image_url, presentation_video_url, film_yourself_video_url, sort_order, created_at, music_tracks(id, title, artist, audio_url, delay_before_avatar_dance), dance_move_genres(genre_id)";
const MOVE_SELECT_WITH_GENRE =
  "id, title, description, level, bpm, thumbnail_url, main_video_url, pro_dancer_video_url, pro_dancer_image_url, dancer_tip_video_url, dancer_tip_image_url, presentation_video_url, film_yourself_video_url, sort_order, created_at, music_tracks(id, title, artist, audio_url, delay_before_avatar_dance), dance_move_genres(genre_id), matching_genres:dance_move_genres!inner(genre_id)";

type HttpErrors = FastifyInstance["httpErrors"];
type DanceMoveRow = Database["public"]["Tables"]["dance_moves"]["Row"];
type DanceMoveWithRelations = Pick<
  DanceMoveRow,
  | "id"
  | "title"
  | "description"
  | "level"
  | "bpm"
  | "thumbnail_url"
  | "main_video_url"
  | "pro_dancer_video_url"
  | "pro_dancer_image_url"
  | "dancer_tip_video_url"
  | "dancer_tip_image_url"
  | "presentation_video_url"
  | "film_yourself_video_url"
  | "sort_order"
  | "created_at"
> & {
  music_tracks: {
    id: string;
    title: string;
    artist: string | null;
    audio_url: string;
    delay_before_avatar_dance: number | null;
  } | null;
  dance_move_genres: Array<{ genre_id: string }>;
};

function toDanceMove(row: DanceMoveWithRelations): DanceMove {
  if (row.film_yourself_video_url === null) {
    throw new Error("Eligible dance move is missing its reference video");
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    level: row.level,
    bpm: row.bpm,
    thumbnailUrl: row.thumbnail_url,
    mainVideoUrl: row.main_video_url,
    proDancerVideoUrl: row.pro_dancer_video_url,
    proDancerImageUrl: row.pro_dancer_image_url,
    dancerTipVideoUrl: row.dancer_tip_video_url,
    dancerTipImageUrl: row.dancer_tip_image_url,
    presentationVideoUrl: row.presentation_video_url,
    filmYourselfVideoUrl: row.film_yourself_video_url,
    genreIds: row.dance_move_genres.map(({ genre_id }) => genre_id),
    music:
      row.music_tracks === null
        ? null
        : {
            id: row.music_tracks.id,
            title: row.music_tracks.title,
            artist: row.music_tracks.artist,
            audioUrl: row.music_tracks.audio_url,
            delayBeforeAvatarDance: row.music_tracks.delay_before_avatar_dance,
          },
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function cursorFilter(cursor: DanceMovesCursor): string {
  return [
    `sort_order.gt.${cursor.sortOrder}`,
    `and(sort_order.eq.${cursor.sortOrder},created_at.gt.${cursor.createdAt})`,
    `and(sort_order.eq.${cursor.sortOrder},created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
  ].join(",");
}

export function createDanceService(supabase: SupabaseClient<Database>, httpErrors: HttpErrors) {
  return {
    async listGenres(): Promise<DanceGenre[]> {
      const { data, error } = await supabase
        .from("dance_genres")
        .select("id, name, sort_order")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw httpErrors.internalServerError("Could not load dance genres");
      return (data ?? []).map((genre) => ({
        id: genre.id,
        name: genre.name,
        sortOrder: genre.sort_order,
      }));
    },

    async listMoves(options: {
      genreId?: string;
      cursor?: DanceMovesCursor;
      limit: number;
    }): Promise<DanceMovesPage> {
      const baseQuery = supabase.from("dance_moves");
      let query = (options.genreId
        ? baseQuery.select(MOVE_SELECT_WITH_GENRE)
        : baseQuery.select(MOVE_SELECT)
      )
        .eq("status", "published")
        .not("film_yourself_video_url", "is", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(options.limit + 1);

      if (options.genreId) query = query.eq("matching_genres.genre_id", options.genreId);
      if (options.cursor) query = query.or(cursorFilter(options.cursor));

      const { data, error } = await query;
      if (error) throw httpErrors.internalServerError("Could not load dance moves");

      const rows = (data ?? []) as DanceMoveWithRelations[];
      const hasNextPage = rows.length > options.limit;
      const items = rows.slice(0, options.limit).map(toDanceMove);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          hasNextPage && last
            ? { sortOrder: last.sortOrder, createdAt: last.createdAt, id: last.id }
            : null,
      };
    },

    async getMove(id: string): Promise<DanceMove> {
      const { data, error } = await supabase
        .from("dance_moves")
        .select(MOVE_SELECT)
        .eq("id", id)
        .eq("status", "published")
        .not("film_yourself_video_url", "is", null)
        .maybeSingle();
      if (error) throw httpErrors.internalServerError("Could not load dance move");
      if (!data) throw httpErrors.notFound("Dance move not found");
      return toDanceMove(data as DanceMoveWithRelations);
    },
  };
}
