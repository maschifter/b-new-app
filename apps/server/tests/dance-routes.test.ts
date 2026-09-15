import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { danceRoutes } from "../src/modules/dance/routes.js";
import { CreateDancePostRequest, encodeDanceMovesCursor } from "../src/modules/dance/schemas.js";
import { createDanceService } from "../src/modules/dance/service.js";

const GENRE_ID = "11111111-1111-4111-8111-111111111111";
const MOVE_ID = "22222222-2222-4222-8222-222222222222";
const MUSIC_ID = "33333333-3333-4333-8333-333333333333";
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

type Handler = (request: {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  user?: { sub: string };
}) => Promise<unknown>;

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
    delete: vi.fn((path: string, _options: unknown, handler: Handler) => {
      handlers[`DELETE ${path}`] = handler;
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
  for (const method of ["select", "eq", "neq", "not", "order", "limit", "or"]) {
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

const postRow = {
  id: MOVE_ID,
  owner_id: GENRE_ID,
  dance_move_id: MOVE_ID,
  music_id: MUSIC_ID,
  video_path: `${GENRE_ID}/${MOVE_ID}.mp4`,
  merged_video_path: null,
  thumbnail_path: null,
  blurhash: null,
  audio_offset_ms: null,
  status: "scored",
  score: 92,
  video_length_s: 12,
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
};

const postMove = { title: "Body Roll", description: "A smooth move" };
const postMusic = { title: "Track", artist: "Artist" };

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
    const list = await app.inject({ method: "GET", url: "/api/dance/posts" });
    const detail = await app.inject({ method: "GET", url: `/api/dance/posts/${MOVE_ID}` });
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/dance/posts/${MOVE_ID}/uploaded`,
    });
    const discard = await app.inject({ method: "DELETE", url: `/api/dance/posts/${MOVE_ID}` });
    const score = await app.inject({ method: "GET", url: `/api/dance/posts/${MOVE_ID}/score` });
    expect(create.statusCode).toBe(401);
    expect(list.statusCode).toBe(401);
    expect(detail.statusCode).toBe(401);
    expect(uploaded.statusCode).toBe(401);
    expect(discard.statusCode).toBe(401);
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

  it("validates dance post history queries before querying Supabase", async () => {
    const from = vi.fn();
    const { app, handlers } = registerDance({ from });
    await danceRoutes(app as never);

    await expect(
      handlers["GET /posts"]?.({ query: { limit: "0" }, user: { sub: GENRE_ID } }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid dance posts query",
    });
    await expect(
      handlers["GET /posts"]?.({ query: { cursor: "not-a-cursor" }, user: { sub: GENRE_ID } }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid dance posts cursor",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns an owned recorded dance with a signed video URL", async () => {
    const query = queryBuilder({ data: postRow, error: null });
    const move = queryBuilder({ data: postMove, error: null });
    const music = queryBuilder({ data: postMusic, error: null });
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        {
          error: null,
          path: `${GENRE_ID}/${MOVE_ID}.mp4`,
          signedUrl: "https://storage.example/read",
        },
      ],
      error: null,
    });
    const { app, handlers } = registerDance({
      from: vi.fn().mockReturnValueOnce(query).mockReturnValueOnce(move).mockReturnValueOnce(music),
      storage: { from: vi.fn(() => ({ createSignedUrls })) },
    });
    await danceRoutes(app as never);

    await expect(
      handlers["GET /posts/:id"]?.({ params: { id: MOVE_ID }, user: { sub: GENRE_ID } }),
    ).resolves.toMatchObject({
      data: {
        id: MOVE_ID,
        videoUrl: "https://storage.example/read",
        danceMove: { title: "Body Roll", music: { title: "Track", artist: "Artist" } },
      },
    });
    expect(query.eq).toHaveBeenCalledWith("owner_id", GENRE_ID);
    expect(createSignedUrls).toHaveBeenCalledWith([`${GENRE_ID}/${MOVE_ID}.mp4`], 3600);
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
    expect(query.or).toHaveBeenCalledWith(expect.stringContaining("sort_order.gt.4"));
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

    await expect(
      handlers["GET /moves/:id"]?.({ params: { id: "not-a-uuid" } }),
    ).rejects.toMatchObject({
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
      handlers["GET /posts/:id"]?.({ params: { id: "not-a-uuid" }, user: { sub: GENRE_ID } }),
    ).rejects.toMatchObject({ statusCode: 400, message: "Invalid dance post id" });
    await expect(
      handlers["GET /posts/:id/score"]?.({ params: { id: "not-a-uuid" }, user: { sub: GENRE_ID } }),
    ).rejects.toMatchObject({ statusCode: 400, message: "Invalid dance post id" });
    await expect(
      handlers["DELETE /posts/:id"]?.({ params: { id: "not-a-uuid" }, user: { sub: GENRE_ID } }),
    ).rejects.toMatchObject({ statusCode: 400, message: "Invalid dance post id" });
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps a null audio offset absent instead of coercing it to a measured zero", () => {
    const base = { danceMoveId: MOVE_ID, videoLength: 12 };

    expect(CreateDancePostRequest.parse(base)).not.toHaveProperty("audioOffsetMs");
    // Without the null guard z.coerce reads this as 0, which the merge would trust as a
    // real measurement instead of falling back to the computed timeline offset.
    expect(CreateDancePostRequest.parse({ ...base, audioOffsetMs: null }).audioOffsetMs).toBe(
      undefined,
    );
    expect(CreateDancePostRequest.parse({ ...base, audioOffsetMs: 0 }).audioOffsetMs).toBe(0);
    expect(CreateDancePostRequest.parse({ ...base, audioOffsetMs: "4200" }).audioOffsetMs).toBe(
      4200,
    );
    expect(CreateDancePostRequest.safeParse({ ...base, audioOffsetMs: -1 }).success).toBe(false);
  });
});
