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

type Handler = (request: { user: { sub: string }; body?: unknown }) => Promise<unknown>;

function getHandler(handlers: Record<string, Handler>, route: string): Handler {
  const handler = handlers[route];
  if (!handler) throw new Error(`Route handler was not registered: ${route}`);
  return handler;
}

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
