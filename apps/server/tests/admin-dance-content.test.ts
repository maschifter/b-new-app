import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { danceContentRoutes } from "../src/modules/admin/dance-content-routes.js";
import {
  CreateDanceMoveRequest,
  CreateMusicTrackRequest,
  DanceMoveListFilter,
  UpdateDanceMoveRequest,
  UpdateMusicTrackRequest,
} from "../src/modules/admin/dance-content-schemas.js";
import { createAdminDanceMovesService } from "../src/modules/admin/dance-moves-service.js";
import { createAdminMusicTracksService } from "../src/modules/admin/music-tracks-service.js";

const GENRE_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_GENRE_ID = "22222222-2222-4222-8222-222222222222";
const MOVE_ID = "33333333-3333-4333-8333-333333333333";
const TRACK_ID = "44444444-4444-4444-8444-444444444444";

const moveRow = {
  id: MOVE_ID,
  legacy_id: null,
  title: "Body Roll",
  description: null,
  level: 2,
  bpm: null,
  thumbnail_url: null,
  main_video_url: null,
  pro_dancer_video_url: null,
  pro_dancer_image_url: null,
  dancer_tip_video_url: null,
  dancer_tip_image_url: null,
  presentation_video_url: null,
  film_yourself_video_url: null,
  music_id: null,
  status: "draft",
  sort_order: 1,
  created_at: "2026-08-26T00:00:00.000Z",
  updated_at: "2026-08-26T00:00:00.000Z",
};

type QueryResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
  count?: number;
};

function queryBuilder(result: QueryResult) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () => query;
  for (const method of [
    "select",
    "order",
    "range",
    "or",
    "ilike",
    "eq",
    "in",
    "insert",
    "update",
    "delete",
  ]) {
    query[method] = vi.fn(chain);
  }
  query.single = vi.fn(() => Promise.resolve(result));
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  // biome-ignore lint/suspicious/noThenProperty: mirrors Supabase's awaitable query builder
  query.then = vi.fn((onfulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onfulfilled),
  );
  return query;
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

const httpErrors = {
  badRequest: (message: string) => httpError(400, message),
  conflict: (message: string) => httpError(409, message),
  notFound: (message: string) => httpError(404, message),
  internalServerError: (message: string) => httpError(500, message),
};

describe("admin dance content validation", () => {
  it("requires pro dancer and dancer tip videos for a dance move", () => {
    const body = {
      title: "Body Roll",
      description: null,
      level: 2,
      bpm: null,
      thumbnail_url: null,
      main_video_url: null,
      pro_dancer_video_url: null,
      pro_dancer_image_url: null,
      dancer_tip_video_url: null,
      dancer_tip_image_url: null,
      presentation_video_url: null,
      film_yourself_video_url: null,
      music_id: null,
      status: "draft",
      sort_order: 1,
    };

    const result = CreateDanceMoveRequest.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["pro_dancer_video_url", "dancer_tip_video_url"]),
      );
    }
  });

  it("does not allow required dance move videos to be cleared during an update", () => {
    expect(UpdateDanceMoveRequest.safeParse({ pro_dancer_video_url: null }).success).toBe(false);
    expect(UpdateDanceMoveRequest.safeParse({ dancer_tip_video_url: null }).success).toBe(false);
  });

  it("requires artist, audio, and thumbnail for a music track", () => {
    expect(
      CreateMusicTrackRequest.safeParse({
        title: "Track",
        artist: null,
        audio_url: "https://example.com/track.mp3",
        thumbnail_url: null,
        status: "draft",
        sort_order: 1,
      }).success,
    ).toBe(false);
  });

  it("accepts a nullable non-negative choreography offset in milliseconds", () => {
    const body = {
      title: "Track",
      artist: "Artist",
      audio_url: "https://example.com/track.mp3",
      delay_before_avatar_dance: 2_500,
      thumbnail_url: "https://example.com/track.jpg",
      status: "draft",
      sort_order: 1,
    };

    expect(CreateMusicTrackRequest.safeParse(body).success).toBe(true);
    expect(UpdateMusicTrackRequest.safeParse({ delay_before_avatar_dance: null }).success).toBe(
      true,
    );
    expect(UpdateMusicTrackRequest.safeParse({ delay_before_avatar_dance: -1 }).success).toBe(
      false,
    );
    expect(UpdateMusicTrackRequest.safeParse({ delay_before_avatar_dance: 1.5 }).success).toBe(
      false,
    );
  });

  it("validates numeric levels and UUID id arrays", () => {
    expect(DanceMoveListFilter.safeParse({ level: 2, id: [MOVE_ID] }).success).toBe(true);
    expect(DanceMoveListFilter.safeParse({ level: "2" }).success).toBe(false);
    expect(DanceMoveListFilter.safeParse({ id: ["not-a-uuid"] }).success).toBe(false);
    expect(
      DanceMoveListFilter.safeParse({ id: Array.from({ length: 501 }, () => MOVE_ID) }).success,
    ).toBe(false);
  });
});

describe("admin dance move service", () => {
  it("keeps complete genre ids and strips both PostgREST embeds", async () => {
    const listQuery = queryBuilder({
      data: [
        {
          ...moveRow,
          dance_move_genres: [{ genre_id: GENRE_ID }, { genre_id: SECOND_GENRE_ID }],
          filter: [{ genre_id: GENRE_ID }],
        },
      ],
      error: null,
      count: 1,
    });
    const from = vi.fn().mockReturnValue(listQuery);
    const service = createAdminDanceMovesService({ from } as never, httpErrors as never);

    const result = await service.list({
      start: 0,
      end: 25,
      sort: "sort_order",
      order: "asc",
      genreId: GENRE_ID,
    });

    expect(listQuery.eq).toHaveBeenCalledWith("filter.genre_id", GENRE_ID);
    expect(result.rows[0]?.genre_ids).toEqual([GENRE_ID, SECOND_GENRE_ID]);
    expect(result.rows[0]).not.toHaveProperty("dance_move_genres");
    expect(result.rows[0]).not.toHaveProperty("filter");
  });

  it("ignores pagination for id-array reference lookups", async () => {
    const listQuery = queryBuilder({
      data: [{ ...moveRow, dance_move_genres: [] }],
      error: null,
      count: 1,
    });
    const service = createAdminDanceMovesService(
      { from: vi.fn().mockReturnValue(listQuery) } as never,
      httpErrors as never,
    );

    await service.list({
      start: 50,
      end: 75,
      sort: "created_at",
      order: "desc",
      ids: [MOVE_ID],
    });

    expect(listQuery.in).toHaveBeenCalledWith("id", [MOVE_ID]);
    expect(listQuery.range).not.toHaveBeenCalled();
  });

  it("rejects unknown genres before inserting a move", async () => {
    const genreQuery = queryBuilder({ data: [], error: null });
    const from = vi.fn((table: string) => {
      if (table === "dance_genres") return genreQuery;
      throw new Error(`Unexpected table: ${table}`);
    });
    const service = createAdminDanceMovesService({ from } as never, httpErrors as never);

    await expect(
      service.create({
        title: "Body Roll",
        description: null,
        level: 2,
        bpm: null,
        thumbnail_url: null,
        main_video_url: null,
        pro_dancer_video_url: "https://example.com/pro.mp4",
        pro_dancer_image_url: null,
        dancer_tip_video_url: "https://example.com/tip.mp4",
        dancer_tip_image_url: null,
        presentation_video_url: null,
        film_yourself_video_url: null,
        music_id: null,
        genre_ids: [GENRE_ID],
        status: "draft",
        sort_order: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("creates a move and its genre joins", async () => {
    const genreQuery = queryBuilder({ data: [{ id: GENRE_ID }], error: null });
    const insertMove = queryBuilder({ data: moveRow, error: null });
    const insertJoins = queryBuilder({ data: null, error: null });
    const getMove = queryBuilder({
      data: { ...moveRow, dance_move_genres: [{ genre_id: GENRE_ID }] },
      error: null,
    });
    const danceMoveQueries = [insertMove, getMove];
    const from = vi.fn((table: string) => {
      if (table === "dance_genres") return genreQuery;
      if (table === "dance_moves") return danceMoveQueries.shift();
      if (table === "dance_move_genres") return insertJoins;
      throw new Error(`Unexpected table: ${table}`);
    });
    const service = createAdminDanceMovesService({ from } as never, httpErrors as never);

    const result = await service.create({
      title: moveRow.title,
      description: null,
      level: 2,
      bpm: null,
      thumbnail_url: null,
      main_video_url: null,
      pro_dancer_video_url: "https://example.com/pro.mp4",
      pro_dancer_image_url: null,
      dancer_tip_video_url: "https://example.com/tip.mp4",
      dancer_tip_image_url: null,
      presentation_video_url: null,
      film_yourself_video_url: null,
      music_id: null,
      genre_ids: [GENRE_ID],
      status: "draft",
      sort_order: 1,
    });

    expect(insertJoins.insert).toHaveBeenCalledWith([
      { dance_move_id: MOVE_ID, genre_id: GENRE_ID },
    ]);
    expect(result.genre_ids).toEqual([GENRE_ID]);
  });

  it("rejects updates to legacy moves that are still missing a required video", async () => {
    const currentMove = queryBuilder({
      data: { ...moveRow, dance_move_genres: [] },
      error: null,
    });
    const from = vi.fn().mockReturnValue(currentMove);
    const service = createAdminDanceMovesService({ from } as never, httpErrors as never);

    await expect(service.update(MOVE_ID, { status: "published" })).rejects.toMatchObject({
      statusCode: 400,
      message: "A dance move requires a pro dancer video URL",
    });
    expect(currentMove.update).not.toHaveBeenCalled();
  });

  it("adds and removes genre joins in one update", async () => {
    const initialGet = queryBuilder({
      data: {
        ...moveRow,
        pro_dancer_video_url: "https://example.com/pro.mp4",
        dancer_tip_video_url: "https://example.com/tip.mp4",
        dance_move_genres: [{ genre_id: GENRE_ID }],
      },
      error: null,
    });
    const joinsRead = queryBuilder({ data: [{ genre_id: GENRE_ID }], error: null });
    const joinsInsert = queryBuilder({ data: null, error: null });
    const joinsDelete = queryBuilder({ data: null, error: null });
    const finalGet = queryBuilder({
      data: { ...moveRow, dance_move_genres: [{ genre_id: SECOND_GENRE_ID }] },
      error: null,
    });
    const danceMoveQueries = [initialGet, finalGet];
    const joinQueries = [joinsRead, joinsInsert, joinsDelete];
    const from = vi.fn((table: string) => {
      if (table === "dance_moves") return danceMoveQueries.shift();
      if (table === "dance_move_genres") return joinQueries.shift();
      throw new Error(`Unexpected table: ${table}`);
    });
    const service = createAdminDanceMovesService({ from } as never, httpErrors as never);

    const result = await service.update(MOVE_ID, { genre_ids: [SECOND_GENRE_ID] });

    expect(joinsInsert.insert).toHaveBeenCalledWith([
      { dance_move_id: MOVE_ID, genre_id: SECOND_GENRE_ID },
    ]);
    expect(joinsDelete.in).toHaveBeenCalledWith("genre_id", [GENRE_ID]);
    expect(result.genre_ids).toEqual([SECOND_GENRE_ID]);
  });
});

describe("admin music track service", () => {
  it("persists a choreography offset update", async () => {
    const row = {
      id: TRACK_ID,
      legacy_id: null,
      title: "Track",
      artist: "Artist",
      audio_url: "https://example.com/track.mp3",
      delay_before_avatar_dance: 2_500,
      thumbnail_url: "https://example.com/track.jpg",
      status: "draft",
      sort_order: 1,
      created_at: "2026-08-26T00:00:00.000Z",
      updated_at: "2026-08-26T00:00:00.000Z",
    };
    const query = queryBuilder({ data: row, error: null });
    const service = createAdminMusicTracksService(
      { from: vi.fn().mockReturnValue(query) } as never,
      httpErrors as never,
    );

    await service.update(TRACK_ID, { delay_before_avatar_dance: 2_500 });

    expect(query.update).toHaveBeenCalledWith({ delay_before_avatar_dance: 2_500 });
  });

  it("maps an in-use track delete to 409", async () => {
    const query = queryBuilder({ data: null, error: { code: "23503" } });
    const service = createAdminMusicTracksService(
      { from: vi.fn().mockReturnValue(query) } as never,
      httpErrors as never,
    );

    await expect(service.delete(TRACK_ID)).rejects.toMatchObject({
      statusCode: 409,
      message: "Track is used by dance moves; detach or replace it first",
    });
  });
});

describe("admin dance content routes", () => {
  it("returns a simple-rest Content-Range header", async () => {
    const genre = {
      id: GENRE_ID,
      legacy_id: null,
      name: "Hip Hop",
      status: "published",
      sort_order: 1,
      created_at: "2026-08-26T00:00:00.000Z",
      updated_at: "2026-08-26T00:00:00.000Z",
    };
    const query = queryBuilder({ data: [genre], error: null, count: 3 });
    const app = Fastify({ logger: false });
    await app.register(sensible);
    app.decorate("supabase", { from: vi.fn().mockReturnValue(query) } as never);
    await app.register(danceContentRoutes, { prefix: "/api/admin" });

    const response = await app.inject({
      method: "GET",
      url: '/api/admin/dance-genres?range=[0,24]&sort=["sort_order","ASC"]&filter={"q":"Hip"}',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-range"]).toBe("dance-genres 0-0/3");
    expect(query.ilike).toHaveBeenCalledWith("name", "%Hip%");
    await app.close();
  });

  it("ignores an oversized range for id-array reference lookups", async () => {
    const genre = {
      id: GENRE_ID,
      legacy_id: null,
      name: "Hip Hop",
      status: "published",
      sort_order: 1,
      created_at: "2026-08-26T00:00:00.000Z",
      updated_at: "2026-08-26T00:00:00.000Z",
    };
    const query = queryBuilder({ data: [genre], error: null, count: 1 });
    const app = Fastify({ logger: false });
    await app.register(sensible);
    app.decorate("supabase", { from: vi.fn().mockReturnValue(query) } as never);
    await app.register(danceContentRoutes, { prefix: "/api/admin" });

    const filter = encodeURIComponent(JSON.stringify({ id: [GENRE_ID] }));
    const response = await app.inject({
      method: "GET",
      url: `/api/admin/dance-genres?range=[0,499]&filter=${filter}`,
    });

    expect(response.statusCode).toBe(200);
    expect(query.in).toHaveBeenCalledWith("id", [GENRE_ID]);
    expect(query.range).not.toHaveBeenCalled();
    await app.close();
  });
});
