import { CURRENT_VERSION, DEFAULT_TEMPLATE_ID } from "@bnewapp/studio-core";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { studioRoutes } from "../src/modules/studio/routes.js";

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
  user: { sub: string };
  body?: unknown;
  query?: unknown;
  params?: unknown;
}) => Promise<unknown>;

function getHandler(handlers: Record<string, Handler>, route: string): Handler {
  const handler = handlers[route];
  if (!handler) throw new Error(`Route handler was not registered: ${route}`);
  return handler;
}

// A chainable Supabase query builder mock. Every filter/order method returns the
// builder, `maybeSingle()` resolves the result, and the builder is itself a
// thenable so an awaited terminal chain (the Explore list) resolves the result too.
type QueryBuilder = Record<string, ReturnType<typeof vi.fn>>;

function queryableRooms(result: { data: unknown; error: unknown }): QueryBuilder {
  const builder: QueryBuilder = {};
  const chain = () => builder;
  for (const method of ["select", "eq", "neq", "order", "limit", "or"]) {
    builder[method] = vi.fn(chain);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  // biome-ignore lint/suspicious/noThenProperty: mirrors Supabase's awaitable PostgrestFilterBuilder
  builder.then = vi.fn((onfulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onfulfilled),
  );
  return builder;
}

const OTHER_ROOM = {
  id: "22222222-2222-4222-8222-222222222222",
  owner_id: "user-2",
  version: CURRENT_VERSION,
  template_id: DEFAULT_TEMPLATE_ID,
  map: { "floor-main": { source: "catalog", id: "stage" } },
  updated_at: "2026-08-10T00:00:00.000Z",
  profiles: { username: "dancer-000002" },
};

const EMPTY_AFTER_RECONCILE = {
  id: "33333333-3333-4333-8333-333333333333",
  owner_id: "user-3",
  version: CURRENT_VERSION,
  template_id: DEFAULT_TEMPLATE_ID,
  map: { "ghost-spot": { source: "catalog", id: "stage" } },
  updated_at: "2026-08-09T00:00:00.000Z",
  profiles: { username: "dancer-000003" },
};

function registerStudio(supabase: unknown) {
  const handlers: Record<string, Handler> = {};
  const capture = (method: string) =>
    vi.fn((path: string, _options: unknown, routeHandler: Handler) => {
      handlers[`${method} ${path}`] = routeHandler;
    });
  const app = {
    authenticate: vi.fn(),
    get: capture("GET"),
    put: capture("PUT"),
    httpErrors: {
      badRequest: (message: string) => Object.assign(new Error(message), { statusCode: 400 }),
      internalServerError: (message: string) =>
        Object.assign(new Error(message), { statusCode: 500 }),
    },
    supabase,
  };
  return { app, handlers };
}

describe("studio room endpoints", () => {
  it("rejects unauthenticated reads and writes", async () => {
    const app = await buildApp(testConfig);

    const read = await app.inject({ method: "GET", url: "/api/studio/room" });
    const write = await app.inject({ method: "PUT", url: "/api/studio/room", payload: {} });

    expect(read.statusCode).toBe(401);
    expect(write.statusCode).toBe(401);
    await app.close();
  });

  it("returns null when the user has no saved room", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ select }) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    const response = await getHandler(handlers, "GET /room")({ user: { sub: "user-1" } });

    expect(response).toEqual({ data: null });
    expect(eq).toHaveBeenCalledWith("owner_id", "user-1");
  });

  it("drops invalid placements when returning a saved room", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "room-1",
        owner_id: "user-1",
        version: CURRENT_VERSION,
        template_id: DEFAULT_TEMPLATE_ID,
        map: {
          "floor-main": { source: "catalog", id: "stage" },
          "ghost-spot": { source: "catalog", id: "stage" },
        },
        updated_at: "2026-08-10T00:00:00.000Z",
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ select }) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    const response = (await getHandler(handlers, "GET /room")({ user: { sub: "user-1" } })) as {
      data: { id: string; ownerId: string; updatedAt: string; snapshot: { map: object } };
    };

    expect(response.data.id).toBe("room-1");
    expect(response.data.ownerId).toBe("user-1");
    expect(response.data.updatedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(response.data.snapshot.map).toHaveProperty("floor-main");
    expect(response.data.snapshot.map).not.toHaveProperty("ghost-spot");
  });

  it("reconciles the snapshot before upserting it", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "room-1",
        owner_id: "user-1",
        version: CURRENT_VERSION,
        template_id: DEFAULT_TEMPLATE_ID,
        map: {},
        updated_at: "2026-08-10T00:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    const supabase = { from: vi.fn().mockReturnValue({ upsert }) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await getHandler(handlers, "PUT /room")({
      user: { sub: "user-1" },
      body: {
        version: CURRENT_VERSION,
        templateId: DEFAULT_TEMPLATE_ID,
        map: {
          "floor-main": { source: "catalog", id: "stage" },
          "ghost-spot": { source: "catalog", id: "stage" },
        },
      },
    });

    const call = upsert.mock.calls[0];
    if (!call) throw new Error("Expected studio room upsert to be called");
    const [payload, options] = call;
    expect(payload.owner_id).toBe("user-1");
    expect(payload.template_id).toBe(DEFAULT_TEMPLATE_ID);
    expect(payload.map).toHaveProperty("floor-main");
    expect(payload.map).not.toHaveProperty("ghost-spot");
    expect(options).toEqual({ onConflict: "owner_id" });
  });

  it("rejects an unknown template with a 400", async () => {
    const supabase = { from: vi.fn() };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await expect(
      getHandler(handlers, "PUT /room")({
        user: { sub: "user-1" },
        body: { version: CURRENT_VERSION, templateId: "does-not-exist", map: {} },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a snapshot from a future version", async () => {
    const supabase = { from: vi.fn() };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await expect(
      getHandler(handlers, "PUT /room")({
        user: { sub: "user-1" },
        body: { version: CURRENT_VERSION + 1, templateId: DEFAULT_TEMPLATE_ID, map: {} },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects an invalid snapshot without overwriting the saved room", async () => {
    const supabase = { from: vi.fn() };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await expect(
      getHandler(handlers, "PUT /room")({ user: { sub: "user-1" }, body: {} }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("explore rooms endpoints", () => {
  const VALID_ID = "11111111-1111-4111-8111-111111111111";

  it("rejects unauthenticated explore reads", async () => {
    const app = await buildApp(testConfig);

    const list = await app.inject({ method: "GET", url: "/api/studio/rooms" });
    const detail = await app.inject({ method: "GET", url: `/api/studio/rooms/${VALID_ID}` });

    expect(list.statusCode).toBe(401);
    expect(detail.statusCode).toBe(401);
    await app.close();
  });

  it("rejects explore reads with an invalid token", async () => {
    const app = await buildApp(testConfig);
    const headers = { authorization: "Bearer invalid-token" };

    const list = await app.inject({ method: "GET", url: "/api/studio/rooms", headers });
    const detail = await app.inject({
      method: "GET",
      url: `/api/studio/rooms/${VALID_ID}`,
      headers,
    });

    expect(list.statusCode).toBe(401);
    expect(detail.statusCode).toBe(401);
    await app.close();
  });

  it("lists other users' rooms, excludes the caller, and filters empty maps", async () => {
    const builder = queryableRooms({ data: [OTHER_ROOM], error: null });
    const supabase = { from: vi.fn().mockReturnValue(builder) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    const response = (await getHandler(handlers, "GET /rooms")({
      user: { sub: "user-1" },
      query: {},
    })) as { data: { items: Array<{ ownerId: string; username: string }>; nextCursor: unknown } };

    expect(builder.neq).toHaveBeenCalledWith("owner_id", "user-1");
    expect(builder.neq).toHaveBeenCalledWith("map", "{}");
    expect(builder.order).toHaveBeenNthCalledWith(1, "updated_at", { ascending: false });
    expect(builder.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(response.data.items).toHaveLength(1);
    expect(response.data.items[0]).toMatchObject({ ownerId: "user-2", username: "dancer-000002" });
    expect(response.data.nextCursor).toBeNull();
  });

  it("returns nextCursor from the last raw row when an extra row proves more data", async () => {
    const builder = queryableRooms({ data: [OTHER_ROOM, EMPTY_AFTER_RECONCILE], error: null });
    const supabase = { from: vi.fn().mockReturnValue(builder) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    const response = (await getHandler(handlers, "GET /rooms")({
      user: { sub: "user-1" },
      query: { limit: "1" },
    })) as { data: { items: unknown[]; nextCursor: { updatedAt: string; id: string } | null } };

    expect(builder.limit).toHaveBeenCalledWith(2);
    expect(response.data.items).toHaveLength(1);
    expect(response.data.nextCursor).toEqual({
      updatedAt: OTHER_ROOM.updated_at,
      id: OTHER_ROOM.id,
    });
  });

  it("drops rooms left empty after reconcile but derives the cursor from the raw row", async () => {
    const builder = queryableRooms({ data: [EMPTY_AFTER_RECONCILE, OTHER_ROOM], error: null });
    const supabase = { from: vi.fn().mockReturnValue(builder) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    const response = (await getHandler(handlers, "GET /rooms")({
      user: { sub: "user-1" },
      query: { limit: "1" },
    })) as { data: { items: unknown[]; nextCursor: { updatedAt: string; id: string } | null } };

    expect(response.data.items).toHaveLength(0);
    expect(response.data.nextCursor).toEqual({
      updatedAt: EMPTY_AFTER_RECONCILE.updated_at,
      id: EMPTY_AFTER_RECONCILE.id,
    });
  });

  it("applies the keyset filter when a cursor is provided", async () => {
    const builder = queryableRooms({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValue(builder) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await getHandler(handlers, "GET /rooms")({
      user: { sub: "user-1" },
      query: { cursorUpdatedAt: "2026-08-10T00:00:00.000Z", cursorId: VALID_ID },
    });

    expect(builder.or).toHaveBeenCalledWith(
      `updated_at.lt.2026-08-10T00:00:00.000Z,and(updated_at.eq.2026-08-10T00:00:00.000Z,id.lt.${VALID_ID})`,
    );
  });

  it("uses room id as the tie-breaker when timestamps match across pages", async () => {
    const tiedRoom = {
      ...OTHER_ROOM,
      id: "11111111-1111-4111-8111-111111111111",
      owner_id: "user-3",
      profiles: { username: "dancer-000003" },
    };
    const firstPage = queryableRooms({ data: [OTHER_ROOM, tiedRoom], error: null });
    const secondPage = queryableRooms({ data: [tiedRoom], error: null });
    const supabase = { from: vi.fn().mockReturnValueOnce(firstPage).mockReturnValueOnce(secondPage) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);
    const listRooms = getHandler(handlers, "GET /rooms");

    const firstResponse = (await listRooms({
      user: { sub: "user-1" },
      query: { limit: "1" },
    })) as { data: { nextCursor: { updatedAt: string; id: string } | null } };
    await listRooms({
      user: { sub: "user-1" },
      query: {
        limit: "1",
        cursorUpdatedAt: firstResponse.data.nextCursor?.updatedAt,
        cursorId: firstResponse.data.nextCursor?.id,
      },
    });

    expect(firstResponse.data.nextCursor).toEqual({
      updatedAt: OTHER_ROOM.updated_at,
      id: OTHER_ROOM.id,
    });
    expect(secondPage.or).toHaveBeenCalledWith(
      `updated_at.lt.${OTHER_ROOM.updated_at},and(updated_at.eq.${OTHER_ROOM.updated_at},id.lt.${OTHER_ROOM.id})`,
    );
  });

  it("keeps the original cursor boundary when an already-returned room moves forward", async () => {
    const returnedRoom = { ...OTHER_ROOM };
    const olderRoom = {
      ...OTHER_ROOM,
      id: "11111111-1111-4111-8111-111111111111",
      owner_id: "user-3",
      updated_at: "2026-08-09T00:00:00.000Z",
      profiles: { username: "dancer-000003" },
    };
    const firstPage = queryableRooms({ data: [returnedRoom, olderRoom], error: null });
    const secondPage = queryableRooms({ data: [olderRoom], error: null });
    const supabase = { from: vi.fn().mockReturnValueOnce(firstPage).mockReturnValueOnce(secondPage) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);
    const listRooms = getHandler(handlers, "GET /rooms");

    const firstResponse = (await listRooms({
      user: { sub: "user-1" },
      query: { limit: "1" },
    })) as { data: { nextCursor: { updatedAt: string; id: string } | null } };
    returnedRoom.updated_at = "2026-08-11T00:00:00.000Z";
    const secondResponse = (await listRooms({
      user: { sub: "user-1" },
      query: {
        limit: "1",
        cursorUpdatedAt: firstResponse.data.nextCursor?.updatedAt,
        cursorId: firstResponse.data.nextCursor?.id,
      },
    })) as { data: { items: Array<{ ownerId: string }> } };

    expect(secondPage.or).toHaveBeenCalledWith(
      `updated_at.lt.${OTHER_ROOM.updated_at},and(updated_at.eq.${OTHER_ROOM.updated_at},id.lt.${OTHER_ROOM.id})`,
    );
    expect(secondResponse.data.items.map((room) => room.ownerId)).toEqual([olderRoom.owner_id]);
  });

  it("rejects an invalid limit before querying", async () => {
    const supabase = { from: vi.fn() };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await expect(
      getHandler(handlers, "GET /rooms")({ user: { sub: "user-1" }, query: { limit: "0" } }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a half-specified cursor before querying", async () => {
    const supabase = { from: vi.fn() };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await expect(
      getHandler(handlers, "GET /rooms")({
        user: { sub: "user-1" },
        query: { cursorUpdatedAt: "2026-08-10T00:00:00.000Z" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects an invalid cursor timestamp before querying", async () => {
    const supabase = { from: vi.fn() };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await expect(
      getHandler(handlers, "GET /rooms")({
        user: { sub: "user-1" },
        query: { cursorUpdatedAt: "not-a-timestamp", cursorId: VALID_ID },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects an invalid cursor room id before querying", async () => {
    const supabase = { from: vi.fn() };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await expect(
      getHandler(handlers, "GET /rooms")({
        user: { sub: "user-1" },
        query: { cursorUpdatedAt: "2026-08-10T00:00:00.000Z", cursorId: "not-a-uuid" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("surfaces a supabase list failure as a 500", async () => {
    const builder = queryableRooms({ data: null, error: { message: "boom" } });
    const supabase = { from: vi.fn().mockReturnValue(builder) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await expect(
      getHandler(handlers, "GET /rooms")({ user: { sub: "user-1" }, query: {} }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("returns a single reconciled room with its owner handle", async () => {
    const builder = queryableRooms({ data: OTHER_ROOM, error: null });
    const supabase = { from: vi.fn().mockReturnValue(builder) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    const response = (await getHandler(handlers, "GET /rooms/:ownerId")({
      user: { sub: "user-1" },
      params: { ownerId: VALID_ID },
    })) as { data: { ownerId: string; username: string; snapshot: { map: object } } | null };

    expect(builder.eq).toHaveBeenCalledWith("owner_id", VALID_ID);
    expect(response.data).toMatchObject({ ownerId: "user-2", username: "dancer-000002" });
    expect(response.data?.snapshot.map).toHaveProperty("floor-main");
  });

  it("returns null when the requested room does not exist", async () => {
    const builder = queryableRooms({ data: null, error: null });
    const supabase = { from: vi.fn().mockReturnValue(builder) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    const response = await getHandler(handlers, "GET /rooms/:ownerId")({
      user: { sub: "user-1" },
      params: { ownerId: VALID_ID },
    });

    expect(response).toEqual({ data: null });
  });

  it("rejects an invalid owner id before querying", async () => {
    const supabase = { from: vi.fn() };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await expect(
      getHandler(handlers, "GET /rooms/:ownerId")({
        user: { sub: "user-1" },
        params: { ownerId: "not-a-uuid" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("surfaces a supabase detail failure as a 500", async () => {
    const builder = queryableRooms({ data: null, error: { message: "boom" } });
    const supabase = { from: vi.fn().mockReturnValue(builder) };
    const { app, handlers } = registerStudio(supabase);
    await studioRoutes(app as never);

    await expect(
      getHandler(handlers, "GET /rooms/:ownerId")({
        user: { sub: "user-1" },
        params: { ownerId: VALID_ID },
      }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});
