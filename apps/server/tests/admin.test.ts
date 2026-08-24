import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { contentRange, parseListQuery } from "../src/lib/react-admin.js";
import { UpdateUserRequest } from "../src/modules/admin/schemas.js";
import { CreateCatalogItemRequest } from "../src/modules/admin/catalog-schemas.js";
import { createAdminService } from "../src/modules/admin/service.js";
import { devRoutes } from "../src/modules/dev/routes.js";
import { authPlugin, isAdmin } from "../src/plugins/auth.js";

const testConfig = {
  NODE_ENV: "test",
  PORT: 3000,
  HOST: "127.0.0.1",
  LOG_LEVEL: "fatal",
  RATE_LIMIT_MAX: 120,
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "test-secret-key",
} as const;

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

const httpErrors = {
  badRequest: (message: string) => httpError(400, message),
  forbidden: (message: string) => httpError(403, message),
  conflict: (message: string) => httpError(409, message),
  notFound: (message: string) => httpError(404, message),
  internalServerError: (message: string) => httpError(500, message),
} as const;

type QueryResult = { data: unknown; error: { code?: string; message: string } | null; count?: number };

function queryBuilder(result: QueryResult) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () => builder;
  for (const method of ["select", "order", "range", "or", "eq", "gte", "update"]) {
    builder[method] = vi.fn(chain);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  // biome-ignore lint/suspicious/noThenProperty: mirrors Supabase's awaitable query builder
  builder.then = vi.fn((onfulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onfulfilled),
  );
  return builder;
}

function makeService(supabase: unknown) {
  return createAdminService(supabase as never, httpErrors as never);
}

async function buildDevTestApp(admin: object) {
  const app = Fastify({ logger: false });
  await app.register(sensible);
  app.decorate("supabase", { auth: { admin } } as never);
  await app.register(devRoutes, { prefix: "/dev", adminSecret: "test-admin-secret" });
  return app;
}

describe("admin authorization", () => {
  it("guards the registered admin routes", async () => {
    const app = await buildApp(testConfig);
    const users = await app.inject({ method: "GET", url: "/api/admin/users" });
    const catalog = await app.inject({ method: "GET", url: "/api/admin/catalog" });
    const upload = await app.inject({ method: "POST", url: "/api/admin/catalog/plant/art" });
    expect(users.statusCode).toBe(401);
    expect(catalog.statusCode).toBe(401);
    expect(upload.statusCode).toBe(401);
    await app.close();
  });

  it("recognizes only app_metadata.role=admin", () => {
    expect(isAdmin({ sub: "1", role: "admin" })).toBe(false);
    expect(isAdmin({ sub: "1", app_metadata: { role: "user" } })).toBe(false);
    expect(isAdmin({ sub: "1", app_metadata: { role: "admin" } })).toBe(true);
  });

  it("returns 401 for an invalid token and 403 for a non-admin token", async () => {
    const app = Fastify({ logger: false });
    await app.register(sensible);
    await app.register(authPlugin);
    await app.ready();

    await expect(
      app.requireAdmin({ jwtVerify: vi.fn().mockRejectedValue(new Error("invalid")) } as never),
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      app.requireAdmin({
        jwtVerify: vi.fn().mockResolvedValue(undefined),
        user: { sub: "1", app_metadata: { role: "user" } },
      } as never),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      app.requireAdmin({
        jwtVerify: vi.fn().mockResolvedValue(undefined),
        user: { sub: "1", app_metadata: { role: "admin" } },
      } as never),
    ).resolves.toBeUndefined();
    await app.close();
  });
});

describe("admin catalog validation", () => {
  it("accepts kebab-case ids and rejects invalid ids or tag values", () => {
    const valid = {
      id: "new-floor-light",
      tags: { type: "floor", size: ["M", "L"] },
      display_name: "New Floor Light",
      status: "draft",
      access: "free",
      sort_order: 40,
    };

    expect(CreateCatalogItemRequest.safeParse(valid).success).toBe(true);
    expect(CreateCatalogItemRequest.safeParse({ ...valid, id: "New Floor Light" }).success).toBe(
      false,
    );
    expect(CreateCatalogItemRequest.safeParse({ ...valid, tags: { type: [] } }).success).toBe(false);
  });

  it("requires a positive-price item to use premium access", () => {
    const item = {
      id: "paid-floor-light",
      tags: { type: "floor", size: "M" },
      display_name: "Paid Floor Light",
      status: "draft",
      sort_order: 41,
      price: 250,
    } as const;

    expect(CreateCatalogItemRequest.safeParse({ ...item, access: "free" }).success).toBe(false);
    expect(CreateCatalogItemRequest.safeParse({ ...item, access: "premium" }).success).toBe(true);
    expect(
      CreateCatalogItemRequest.safeParse({ ...item, access: "premium", price: null }).success,
    ).toBe(false);
  });
});

describe("development admin routes", () => {
  it("rejects a development admin secret shorter than 32 characters", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUPABASE_URL", testConfig.SUPABASE_URL);
    vi.stubEnv("SUPABASE_SECRET_KEY", testConfig.SUPABASE_SECRET_KEY);
    vi.stubEnv("DEV_ADMIN_SECRET", "too-short");

    expect(() => loadConfig()).toThrow("Invalid environment variables");
    vi.unstubAllEnvs();
  });

  it("does not register development bootstrap routes in staging", async () => {
    const app = await buildApp({
      ...testConfig,
      NODE_ENV: "staging",
      DEV_ADMIN_SECRET: "a-secure-development-secret-value",
    });

    const response = await app.inject({ method: "POST", url: "/dev/create-user", payload: {} });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it.each([
    ["/dev/create-user", { email: "invalid", password: "short" }],
    ["/dev/grant-admin", { email: "invalid", role: "owner" }],
  ])("returns 400 for an invalid %s payload", async (url, payload) => {
    const app = await buildDevTestApp({});

    const response = await app.inject({
      method: "POST",
      url,
      headers: { "x-admin-secret": "test-admin-secret" },
      payload,
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("finds an admin candidate beyond the first auth page", async () => {
    const target = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "maya@example.com",
      app_metadata: {},
    };
    const firstPage = Array.from({ length: 1000 }, () => ({
      id: "22222222-2222-4222-8222-222222222222",
      email: "other@example.com",
    }));
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ data: { users: firstPage }, error: null })
      .mockResolvedValueOnce({ data: { users: [target] }, error: null });
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const app = await buildDevTestApp({ listUsers, updateUserById });

    const response = await app.inject({
      method: "POST",
      url: "/dev/grant-admin",
      headers: { "x-admin-secret": "test-admin-secret" },
      payload: { email: target.email },
    });

    expect(response.statusCode).toBe(200);
    expect(listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 1000 });
    expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 });
    expect(updateUserById).toHaveBeenCalledWith(target.id, {
      app_metadata: { role: "admin" },
    });
    await app.close();
  });
});

describe("react-admin list protocol", () => {
  it("parses inclusive ranges, sorting, filters, and formats Content-Range", () => {
    const parsed = parseListQuery({
      range: "[10,34]",
      sort: '["username","ASC"]',
      filter: '{"q":"maya"}',
    });

    expect(parsed).toEqual({
      start: 10,
      end: 35,
      sort: "username",
      order: "asc",
      filter: { q: "maya" },
    });
    expect(contentRange("users", 10, 25, 91)).toBe("users 10-34/91");
  });

  it.each([
    { range: "not-json" },
    { range: "[10,9]" },
    { range: "[0,100]" },
    { sort: '["username","SIDEWAYS"]' },
    { filter: "[]" },
  ])("rejects an invalid list query: %j", (query) => {
    expect(() => parseListQuery(query)).toThrow();
  });

  it("lists, searches, sorts, paginates, and enriches profiles", async () => {
    const builder = queryBuilder({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "maya@example.com",
          username: "maya",
          created_at: "2026-08-20T00:00:00.000Z",
        },
      ],
      error: null,
      count: 3,
    });
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        users: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            last_sign_in_at: "2026-08-21T00:00:00.000Z",
            app_metadata: { role: "admin" },
          },
        ],
      },
      error: null,
    });
    const supabase = {
      from: vi.fn().mockReturnValue(builder),
      auth: { admin: { listUsers } },
    };

    const result = await makeService(supabase).listUsers({
      start: 10,
      end: 35,
      sort: "username",
      order: "asc",
      q: "ma%,ya",
    });

    expect(builder.order).toHaveBeenCalledWith("username", { ascending: true });
    expect(builder.range).toHaveBeenCalledWith(10, 34);
    expect(builder.or).toHaveBeenCalledWith("username.ilike.%maya%,email.ilike.%maya%");
    expect(listUsers).toHaveBeenCalledOnce();
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
    expect(result).toEqual({
      total: 3,
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "maya@example.com",
          username: "maya",
          created_at: "2026-08-20T00:00:00.000Z",
          last_sign_in_at: "2026-08-21T00:00:00.000Z",
          app_metadata_role: "admin",
        },
      ],
    });
  });
});

describe("admin user service", () => {
  const profile = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "maya@example.com",
    username: "maya",
    created_at: "2026-08-20T00:00:00.000Z",
  };

  it("returns profile, auth, and studio-room detail", async () => {
    const profileQuery = queryBuilder({ data: profile, error: null });
    const roomQuery = queryBuilder({
      data: {
        template_id: "dance-floor",
        map: { stage: { id: "stage" }, light: { id: "light" } },
        updated_at: "2026-08-21T00:00:00.000Z",
      },
      error: null,
    });
    const supabase = {
      from: vi.fn().mockReturnValueOnce(profileQuery).mockReturnValueOnce(roomQuery),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                last_sign_in_at: "2026-08-21T01:00:00.000Z",
                email_confirmed_at: "2026-08-20T01:00:00.000Z",
                app_metadata: { role: "admin" },
              },
            },
            error: null,
          }),
        },
      },
    };

    await expect(makeService(supabase).getUser(profile.id)).resolves.toMatchObject({
      ...profile,
      app_metadata_role: "admin",
      studio_room: { template_id: "dance-floor", item_count: 2 },
    });
  });

  it("returns 404 when the profile is missing", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue(queryBuilder({ data: null, error: null })),
      auth: { admin: {} },
    };
    await expect(makeService(supabase).getUser(profile.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("updates username and maps a duplicate to 409", async () => {
    const successQuery = queryBuilder({ data: { ...profile, username: "maya-2" }, error: null });
    const duplicateQuery = queryBuilder({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });
    const success = makeService({
      from: vi.fn().mockReturnValue(successQuery),
      auth: { admin: {} },
    });
    const duplicate = makeService({
      from: vi.fn().mockReturnValue(duplicateQuery),
      auth: { admin: {} },
    });

    await expect(success.updateUser(profile.id, { username: "maya-2" })).resolves.toMatchObject({
      username: "maya-2",
    });
    await expect(duplicate.updateUser(profile.id, { username: "taken" })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(() => UpdateUserRequest.parse({ username: "valid", role: "admin" })).toThrow();
  });

  it("deletes the auth user so database cascades can run", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    const service = makeService({ auth: { admin: { deleteUser } } });
    await expect(service.deleteUser(profile.id)).resolves.toEqual({ id: profile.id });
    expect(deleteUser).toHaveBeenCalledWith(profile.id);
  });
});

describe("admin dashboard", () => {
  it("returns user and studio activity counts", async () => {
    const counts = [40, 2, 8, 20, 15, 7];
    const builders = counts.map((count) => queryBuilder({ data: null, error: null, count }));
    const supabase = {
      from: vi.fn().mockImplementation(() => builders.shift()),
      auth: { admin: {} },
    };

    await expect(makeService(supabase).getDashboardSummary()).resolves.toEqual({
      users: { total: 40, last24h: 2, last7d: 8, last30d: 20 },
      rooms: { total: 15, updatedLast7d: 7 },
    });
  });
});
