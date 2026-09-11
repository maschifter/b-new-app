import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { danceRoutes } from "../src/modules/dance/routes.js";
import { encodeDanceMovesCursor } from "../src/modules/dance/schemas.js";
import { createDanceService } from "../src/modules/dance/service.js";

const GENRE_ID = "11111111-1111-4111-8111-111111111111";
const MOVE_ID = "22222222-2222-4222-8222-222222222222";
const CREATED_AT = "2026-09-11T00:00:00.000Z";

const testConfig = {
  NODE_ENV: "test",
  PORT: 3000,
  HOST: "127.0.0.1",
  LOG_LEVEL: "fatal",
  RATE_LIMIT_MAX: 120,
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "test-secret-key",
} as const;

type Handler = (request: { body?: unknown; query?: unknown; params?: unknown; user?: { sub: string } }) => Promise<unknown>;

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function registerDance(supabase: Record<string, unknown>) {
  const handlers: Record<string, Handler> = {};
  const app = {
    authenticate: vi.fn(),
    get: vi.fn((path: string, _options: unknown, handler: Handler) => {
      handlers[`GET ${path}`] = handler;
    }),
    post: vi.fn((path: string, _options: unknown, handler: Handler) => {
      handlers[`POST ${path}`] = handler;
    }),
    httpErrors: {
      badRequest: (message: string) => httpError(400, message),
      notFound: (message: string) => httpError(404, message),
      internalServerError: (message: string) => httpError(500, message),
    },
    supabase,
  };
  return { app, handlers };
}

type QueryResult = { data: unknown; error: unknown };

function queryBuilder(result: QueryResult) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () => query;
  for (const method of ["select", "eq", "not", "order", "limit", "or"]) {
    query[method] = vi.fn(chain);
  }
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  // biome-ignore lint/suspicious/noThenProperty: mirrors Supabase's awaitable query builder
  query.then = vi.fn((onfulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onfulfilled),
  );
  return query;
}

const moveRow = {
  id: MOVE_ID,
  title: "Body Roll",
  description: "A smooth move",
  level: 2,
  bpm: 120,
  thumbnail_url: "https://example.com/thumb.jpg",
  main_video_url: "https://example.com/learn.mp4",
  pro_dancer_video_url: "https://example.com/pro.mp4",
  pro_dancer_image_url: null,
  dancer_tip_video_url: "https://example.com/tip.mp4",
  dancer_tip_image_url: null,
  presentation_video_url: "https://example.com/presentation.mp4",
  film_yourself_video_url: "https://example.com/reference.mp4",
  sort_order: 4,
  created_at: CREATED_AT,
  music_tracks: {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Track",
    artist: "Artist",
    audio_url: "https://example.com/track.mp3",
    delay_before_avatar_dance: 2500,
  },
  dance_move_genres: [{ genre_id: GENRE_ID }],
};

describe("dance consumer routes", () => {
  it("requires authentication for catalog reads", async () => {
    const app = await buildApp(testConfig);
    const response = await app.inject({ method: "GET", url: "/api/dance/genres" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("requires authentication for every dance post endpoint", async () => {
    const app = await buildApp(testConfig);
    const create = await app.inject({ method: "POST", url: "/api/dance/posts", payload: {} });
    const uploaded = await app.inject({ method: "POST", url: `/api/dance/posts/${MOVE_ID}/uploaded` });
    const score = await app.inject({ method: "GET", url: `/api/dance/posts/${MOVE_ID}/score` });
    expect(create.statusCode).toBe(401);
    expect(uploaded.statusCode).toBe(401);
    expect(score.statusCode).toBe(401);
    await app.close();
  });

  it("returns published genres in sort order", async () => {
    const query = queryBuilder({
      data: [{ id: GENRE_ID, name: "Hip Hop", sort_order: 1 }],
      error: null,
    });
    const { app, handlers } = registerDance({ from: vi.fn().mockReturnValue(query) });
    await danceRoutes(app as never);

    await expect(handlers["GET /genres"]?.({})).resolves.toEqual({
      data: [{ id: GENRE_ID, name: "Hip Hop", sortOrder: 1 }],
    });
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(query.order).toHaveBeenNthCalledWith(1, "sort_order", { ascending: true });
  });

  it("validates move list queries before querying Supabase", async () => {
    const from = vi.fn();
    const { app, handlers } = registerDance({ from });
    await danceRoutes(app as never);

    await expect(handlers["GET /moves"]?.({ query: { limit: "0" } })).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid dance moves query",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns only eligible published moves and maps joined music", async () => {
    const query = queryBuilder({ data: [moveRow], error: null });
    const { app, handlers } = registerDance({ from: vi.fn().mockReturnValue(query) });
    await danceRoutes(app as never);

    await expect(handlers["GET /moves"]?.({ query: { limit: "1" } })).resolves.toEqual({
      data: {
        items: [
          expect.objectContaining({
            id: MOVE_ID,
            filmYourselfVideoUrl: "https://example.com/reference.mp4",
            genreIds: [GENRE_ID],
            music: expect.objectContaining({
              audioUrl: "https://example.com/track.mp3",
              delayBeforeAvatarDance: 2500,
            }),
          }),
        ],
        nextCursor: null,
      },
    });
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(query.not).toHaveBeenCalledWith("film_yourself_video_url", "is", null);
    expect(query.limit).toHaveBeenCalledWith(2);
  });

  it("applies genre and keyset cursor filters", async () => {
    const query = queryBuilder({ data: [], error: null });
    const { app, handlers } = registerDance({ from: vi.fn().mockReturnValue(query) });
    await danceRoutes(app as never);

    const cursor = encodeDanceMovesCursor({ sortOrder: 4, createdAt: CREATED_AT, id: MOVE_ID });
    await handlers["GET /moves"]?.({ query: { genre_id: GENRE_ID, cursor, limit: "10" } });

    expect(query.eq).toHaveBeenCalledWith("matching_genres.genre_id", GENRE_ID);
    expect(query.or).toHaveBeenCalledWith(
      expect.stringContaining("sort_order.gt.4"),
    );
  });

  it("returns a cursor from the final item when another page exists", async () => {
    const query = queryBuilder({ data: [moveRow, { ...moveRow, id: GENRE_ID }], error: null });
    const service = createDanceService(
      { from: vi.fn().mockReturnValue(query) } as never,
      registerDance({}).app.httpErrors as never,
    );

    await expect(service.listMoves({ limit: 1 })).resolves.toMatchObject({
      nextCursor: { sortOrder: 4, createdAt: CREATED_AT, id: MOVE_ID },
    });
  });

  it("returns 404 for a missing eligible move and 500 for Supabase failures", async () => {
    const missing = queryBuilder({ data: null, error: null });
    const missingService = createDanceService(
      { from: vi.fn().mockReturnValue(missing) } as never,
      registerDance({}).app.httpErrors as never,
    );
    await expect(missingService.getMove(MOVE_ID)).rejects.toMatchObject({ statusCode: 404 });

    const failed = queryBuilder({ data: null, error: { message: "offline" } });
    const failedService = createDanceService(
      { from: vi.fn().mockReturnValue(failed) } as never,
      registerDance({}).app.httpErrors as never,
    );
    await expect(failedService.listGenres()).rejects.toMatchObject({ statusCode: 500 });
  });

  it("rejects invalid move ids before querying Supabase", async () => {
    const from = vi.fn();
    const { app, handlers } = registerDance({ from });
    await danceRoutes(app as never);

    await expect(handlers["GET /moves/:id"]?.({ params: { id: "not-a-uuid" } })).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid dance move id",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("validates post bodies and post ids before touching Supabase", async () => {
    const from = vi.fn();
    const { app, handlers } = registerDance({ from });
    await danceRoutes(app as never);

    await expect(
      handlers["POST /posts"]?.({
        body: { danceMoveId: "not-a-uuid", videoLength: 0 },
        user: { sub: GENRE_ID },
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: "Invalid dance post" });
    await expect(
      handlers["GET /posts/:id/score"]?.({ params: { id: "not-a-uuid" }, user: { sub: GENRE_ID } }),
    ).rejects.toMatchObject({ statusCode: 400, message: "Invalid dance post id" });
    expect(from).not.toHaveBeenCalled();
  });
});
