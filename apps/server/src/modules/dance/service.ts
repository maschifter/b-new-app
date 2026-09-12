import { coerceScanStatus } from "@bnewapp/dance-core";
import type {
  CreateDancePostResult,
  DanceGenre,
  DanceMove,
  DanceMovesPage,
  DancePost,
  Database,
  ScanStatus,
} from "@bnewapp/types";
import { randomUUID } from "node:crypto";
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

const POST_STATUSES = ["uploading", "uploaded", "scoring", "scored", "failed"] as const;

function toDancePostStatus(value: string): DancePost["status"] | null {
  return POST_STATUSES.find((status) => status === value) ?? null;
}

function toDancePost(
  row: Pick<
    Database["public"]["Tables"]["dance_posts"]["Row"],
    | "id"
    | "dance_move_id"
    | "music_id"
    | "status"
    | "score"
    | "video_length_s"
    | "created_at"
    | "updated_at"
  >,
  httpErrors: HttpErrors,
): DancePost {
  const status = toDancePostStatus(row.status);
  if (status === null) throw httpErrors.internalServerError("Invalid dance post status");
  return {
    id: row.id,
    danceMoveId: row.dance_move_id,
    musicId: row.music_id,
    status,
    score: row.score,
    videoLengthS: row.video_length_s,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDanceService(
  supabase: SupabaseClient<Database>,
  httpErrors: HttpErrors,
  danceVideoBucket = "dance-videos",
) {
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

    async createPost(
      ownerId: string,
      input: { danceMoveId: string; videoLength: number },
    ): Promise<CreateDancePostResult> {
      const { data: move, error: moveError } = await supabase
        .from("dance_moves")
        .select("id, music_id")
        .eq("id", input.danceMoveId)
        .eq("status", "published")
        .not("film_yourself_video_url", "is", null)
        .maybeSingle();
      if (moveError) throw httpErrors.internalServerError("Could not load dance move");
      if (!move) throw httpErrors.notFound("Dance move not found");

      const postId = randomUUID();
      const path = `${ownerId}/${postId}.mp4`;
      const { error: insertError } = await supabase.from("dance_posts").insert({
        id: postId,
        owner_id: ownerId,
        dance_move_id: move.id,
        music_id: move.music_id,
        video_path: path,
        video_length_s: input.videoLength,
        status: "uploading",
      });
      if (insertError) throw httpErrors.internalServerError("Could not create dance post");

      const { data: upload, error: uploadError } = await supabase.storage
        .from(danceVideoBucket)
        .createSignedUploadUrl(path);
      if (uploadError || !upload) {
        await supabase.from("dance_posts").delete().eq("id", postId).eq("owner_id", ownerId);
        throw httpErrors.internalServerError("Could not create dance video upload URL");
      }
      return { postId, upload: { signedUrl: upload.signedUrl, path } };
    },

    async markUploaded(ownerId: string, postId: string): Promise<DancePost> {
      const { data: existing, error: existingError } = await supabase
        .from("dance_posts")
        .select("id, owner_id, dance_move_id, music_id, status, score, video_length_s, created_at, updated_at")
        .eq("id", postId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (existingError) throw httpErrors.internalServerError("Could not load dance post");
      if (!existing) throw httpErrors.notFound("Dance post not found");

      const filename = `${postId}.mp4`;
      const { data: uploadedFiles, error: storageError } = await supabase.storage
        .from(danceVideoBucket)
        .list(ownerId, { limit: 1, search: filename });
      if (storageError) throw httpErrors.internalServerError("Could not verify dance video upload");
      if (!uploadedFiles?.some((file) => file.name === filename)) {
        throw httpErrors.conflict("Dance video upload not found");
      }

      let post = existing;
      if (existing.status === "uploading") {
        const { data: updated, error: updateError } = await supabase
          .from("dance_posts")
          .update({ status: "uploaded" })
          .eq("id", postId)
          .eq("owner_id", ownerId)
          .eq("status", "uploading")
          .select("id, owner_id, dance_move_id, music_id, status, score, video_length_s, created_at, updated_at")
          .maybeSingle();
        if (updateError) throw httpErrors.internalServerError("Could not update dance post");
        if (!updated) throw httpErrors.conflict("Dance post upload state changed");
        post = updated;
      }

      const { error: scanError } = await supabase.from("dance_scans").upsert(
        { post_id: postId, owner_id: ownerId, status: "pending" },
        { onConflict: "post_id", ignoreDuplicates: true },
      );
      if (scanError) throw httpErrors.internalServerError("Could not queue dance scan");
      return toDancePost(post, httpErrors);
    },

    async discardUploadingPost(ownerId: string, postId: string): Promise<void> {
      const { data: deletedPost, error: deleteError } = await supabase
        .from("dance_posts")
        .delete()
        .eq("id", postId)
        .eq("owner_id", ownerId)
        .eq("status", "uploading")
        .select("video_path")
        .maybeSingle();
      if (deleteError) throw httpErrors.internalServerError("Could not discard dance post");
      if (!deletedPost) return;

      if (deletedPost.video_path !== null) {
        const { error: storageError } = await supabase.storage
          .from(danceVideoBucket)
          .remove([deletedPost.video_path]);
        if (storageError) throw httpErrors.internalServerError("Could not remove dance video");
      }
    },

    async getScoreStatus(ownerId: string, postId: string): Promise<ScanStatus> {
      const { data: scan, error: scanError } = await supabase
        .from("dance_scans")
        .select("status, is_external_score")
        .eq("post_id", postId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (scanError) throw httpErrors.internalServerError("Could not load dance scan");

      // The worker writes `dance_posts.score` before marking its scan completed.
      // Reading in the opposite order avoids returning a completed scan paired
      // with the pre-score post snapshot, which would prematurely stop polling.
      const { data: post, error: postError } = await supabase
        .from("dance_posts")
        .select("status, score")
        .eq("id", postId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (postError) throw httpErrors.internalServerError("Could not load dance post");
      if (!post) throw httpErrors.notFound("Dance post not found");

      return coerceScanStatus({
        postStatus: post.status,
        score: post.score,
        scanStatus: scan?.status ?? null,
        isExternalScore: scan?.is_external_score ?? null,
      });
    },
  };
}
