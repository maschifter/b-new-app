import type { FastifyInstance, FastifyRequest } from "fastify";
import type { z } from "zod";
import { ListQuery, contentRange, parseListQuery } from "../../lib/react-admin.js";
import {
  CreateDanceGenreRequest,
  CreateDanceMoveRequest,
  CreateMusicTrackRequest,
  DanceContentIdParam,
  DanceGenreListFilter,
  DanceMoveListFilter,
  MusicTrackListFilter,
  UpdateDanceGenreRequest,
  UpdateDanceMoveRequest,
  UpdateMusicTrackRequest,
} from "./dance-content-schemas.js";
import { createAdminDanceGenresService } from "./dance-genres-service.js";
import { DanceMediaImageQuery, DanceMediaUploadRequest } from "./dance-media-schemas.js";
import { InvalidDanceMediaImageError, createDanceMediaService } from "./dance-media-service.js";
import { createAdminDanceMovesService } from "./dance-moves-service.js";
import { createAdminMusicTracksService } from "./music-tracks-service.js";

function hasIdFilter(value: unknown): value is { id: string[] } {
  return typeof value === "object" && value !== null && "id" in value && Array.isArray(value.id);
}

function parseResourceListQuery<T extends z.ZodTypeAny>(
  raw: unknown,
  filterSchema: T,
  fastify: FastifyInstance,
  errorMessage: string,
) {
  try {
    const query = ListQuery.parse(raw);
    const rawFilter = query.filter ? JSON.parse(query.filter) : {};
    const filter: z.infer<T> = filterSchema.parse(rawFilter);
    const queryForList = hasIdFilter(filter)
      ? {
          ...(query.sort === undefined ? {} : { sort: query.sort }),
          ...(query.filter === undefined ? {} : { filter: query.filter }),
        }
      : query;
    return { ...parseListQuery(queryForList), filter };
  } catch {
    throw fastify.httpErrors.badRequest(errorMessage);
  }
}

export async function danceContentRoutes(fastify: FastifyInstance) {
  const genres = createAdminDanceGenresService(fastify.supabase, fastify.httpErrors);
  const tracks = createAdminMusicTracksService(fastify.supabase, fastify.httpErrors);
  const moves = createAdminDanceMovesService(fastify.supabase, fastify.httpErrors);
  const danceMedia = createDanceMediaService(fastify.supabase, fastify.httpErrors);

  fastify.post("/dance-media/uploads", async (request) => {
    const body = DanceMediaUploadRequest.safeParse(request.body);
    if (!body.success) throw fastify.httpErrors.badRequest("Invalid dance media upload request");
    return { data: await danceMedia.createUploadTicket(body.data) };
  });

  fastify.post("/dance-media/images", async (request) => {
    const query = DanceMediaImageQuery.safeParse(request.query);
    if (!query.success) throw fastify.httpErrors.badRequest("Invalid dance media image query");
    if (!request.isMultipart()) throw fastify.httpErrors.badRequest("Expected an image upload");
    const file = await request.file({ limits: { fileSize: 10 * 1024 * 1024 } });
    if (!file) throw fastify.httpErrors.badRequest("Image file is required");
    try {
      return { data: await danceMedia.uploadImage(query.data, await file.toBuffer()) };
    } catch (error) {
      if (error instanceof InvalidDanceMediaImageError) {
        throw fastify.httpErrors.badRequest(error.message);
      }
      throw error;
    }
  });

  fastify.get("/dance-genres", async (request, reply) => {
    const { start, end, sort, order, filter } = parseResourceListQuery(
      request.query,
      DanceGenreListFilter,
      fastify,
      "Invalid dance genre list query",
    );
    const result = await genres.list({
      start,
      end,
      sort,
      order,
      ...(filter.q === undefined ? {} : { q: filter.q }),
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.id === undefined ? {} : { ids: filter.id }),
    });
    reply.header(
      "Content-Range",
      contentRange("dance-genres", filter.id ? 0 : start, result.rows.length, result.total),
    );
    return result.rows;
  });

  fastify.get("/dance-genres/:id", async (request) => {
    const params = DanceContentIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid dance genre id");
    return genres.get(params.data.id);
  });

  fastify.post("/dance-genres", async (request) => {
    const body = CreateDanceGenreRequest.safeParse(request.body);
    if (!body.success) throw fastify.httpErrors.badRequest("Invalid dance genre");
    return genres.create(body.data);
  });

  const updateGenre = async (request: FastifyRequest) => {
    const params = DanceContentIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid dance genre id");
    const body = UpdateDanceGenreRequest.safeParse(request.body);
    if (!body.success) throw fastify.httpErrors.badRequest("Invalid dance genre update");
    return genres.update(params.data.id, body.data);
  };
  fastify.put("/dance-genres/:id", updateGenre);
  fastify.patch("/dance-genres/:id", updateGenre);

  fastify.delete("/dance-genres/:id", async (request) => {
    const params = DanceContentIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid dance genre id");
    return genres.delete(params.data.id);
  });

  fastify.get("/music-tracks", async (request, reply) => {
    const { start, end, sort, order, filter } = parseResourceListQuery(
      request.query,
      MusicTrackListFilter,
      fastify,
      "Invalid music track list query",
    );
    const result = await tracks.list({
      start,
      end,
      sort,
      order,
      ...(filter.q === undefined ? {} : { q: filter.q }),
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.id === undefined ? {} : { ids: filter.id }),
    });
    reply.header(
      "Content-Range",
      contentRange("music-tracks", filter.id ? 0 : start, result.rows.length, result.total),
    );
    return result.rows;
  });

  fastify.get("/music-tracks/:id", async (request) => {
    const params = DanceContentIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid music track id");
    return tracks.get(params.data.id);
  });

  fastify.post("/music-tracks", async (request) => {
    const body = CreateMusicTrackRequest.safeParse(request.body);
    if (!body.success) throw fastify.httpErrors.badRequest("Invalid music track");
    return tracks.create(body.data);
  });

  const updateTrack = async (request: FastifyRequest) => {
    const params = DanceContentIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid music track id");
    const body = UpdateMusicTrackRequest.safeParse(request.body);
    if (!body.success) throw fastify.httpErrors.badRequest("Invalid music track update");
    return tracks.update(params.data.id, body.data);
  };
  fastify.put("/music-tracks/:id", updateTrack);
  fastify.patch("/music-tracks/:id", updateTrack);

  fastify.delete("/music-tracks/:id", async (request) => {
    const params = DanceContentIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid music track id");
    return tracks.delete(params.data.id);
  });

  fastify.get("/dance-moves", async (request, reply) => {
    const { start, end, sort, order, filter } = parseResourceListQuery(
      request.query,
      DanceMoveListFilter,
      fastify,
      "Invalid dance move list query",
    );
    const result = await moves.list({
      start,
      end,
      sort,
      order,
      ...(filter.q === undefined ? {} : { q: filter.q }),
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.level === undefined ? {} : { level: filter.level }),
      ...(filter.genre_id === undefined ? {} : { genreId: filter.genre_id }),
      ...(filter.music_id === undefined ? {} : { musicId: filter.music_id }),
      ...(filter.id === undefined ? {} : { ids: filter.id }),
    });
    reply.header(
      "Content-Range",
      contentRange("dance-moves", filter.id ? 0 : start, result.rows.length, result.total),
    );
    return result.rows;
  });

  fastify.get("/dance-moves/:id", async (request) => {
    const params = DanceContentIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid dance move id");
    return moves.get(params.data.id);
  });

  fastify.post("/dance-moves", async (request) => {
    const body = CreateDanceMoveRequest.safeParse(request.body);
    if (!body.success) {
      const message = body.error.issues[0]?.message ?? "Invalid dance move";
      throw fastify.httpErrors.badRequest(message);
    }
    return moves.create(body.data);
  });

  const updateMove = async (request: FastifyRequest) => {
    const params = DanceContentIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid dance move id");
    const body = UpdateDanceMoveRequest.safeParse(request.body);
    if (!body.success) {
      const message = body.error.issues[0]?.message ?? "Invalid dance move update";
      throw fastify.httpErrors.badRequest(message);
    }
    return moves.update(params.data.id, body.data);
  };
  fastify.put("/dance-moves/:id", updateMove);
  fastify.patch("/dance-moves/:id", updateMove);

  fastify.delete("/dance-moves/:id", async (request) => {
    const params = DanceContentIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid dance move id");
    return moves.delete(params.data.id);
  });
}
