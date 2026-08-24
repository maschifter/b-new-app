import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { adminRoutes } from "../src/modules/admin/routes.js";

const VALID_BODY = {
  id: "new-plant",
  tags: { type: "decor", size: "S" },
  display_name: "New Plant",
  status: "draft",
  access: "free",
  sort_order: 40,
};

function queryBuilder(result: { data: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () => query;
  for (const method of ["select", "eq", "insert"]) query[method] = vi.fn(chain);
  query.single = vi.fn(() => Promise.resolve(result));
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  return query;
}

async function buildAdminCatalogApp(supabase: object) {
  const app = Fastify({ logger: false });
  await app.register(sensible);
  await app.register(multipart, { limits: { files: 1, fileSize: 5 * 1024 * 1024 } });
  app.decorate("supabase", supabase as never);
  app.decorate("catalogService", { invalidate: vi.fn() } as never);
  app.decorate("requireAdmin", vi.fn().mockResolvedValue(undefined));
  await app.register(adminRoutes, { prefix: "/api/admin" });
  return app;
}

function multipartBody(bytes: Buffer, boundary: string): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="art.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

describe("admin catalog routes", () => {
  it("returns 400 for an invalid catalog slug before data access", async () => {
    const supabase = { from: vi.fn() };
    const app = await buildAdminCatalogApp(supabase);

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/catalog",
      payload: { ...VALID_BODY, id: "Invalid Slug" },
    });

    expect(response.statusCode).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 409 for a duplicate catalog id", async () => {
    const query = queryBuilder({ data: null, error: { code: "23505" } });
    const app = await buildAdminCatalogApp({ from: vi.fn().mockReturnValue(query) });

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/catalog",
      payload: VALID_BODY,
    });

    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it("returns 400 for an uploaded file whose bytes are not a supported image", async () => {
    const query = queryBuilder({
      data: {
        ...VALID_BODY,
        art_url: null,
        art_hitbox: null,
        blurhash: null,
        price: null,
        created_at: "2026-08-21T00:00:00.000Z",
        updated_at: "2026-08-21T00:00:00.000Z",
      },
      error: null,
    });
    const app = await buildAdminCatalogApp({ from: vi.fn().mockReturnValue(query) });
    const boundary = "catalog-test-boundary";

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/catalog/new-plant/art",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(Buffer.from("not-an-image"), boundary),
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 413 when an upload exceeds 5 MiB", async () => {
    const query = queryBuilder({ data: null, error: null });
    const app = await buildAdminCatalogApp({ from: vi.fn().mockReturnValue(query) });
    const boundary = "catalog-size-boundary";

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/catalog/new-plant/art",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(Buffer.alloc(5 * 1024 * 1024 + 1), boundary),
    });

    expect(response.statusCode).toBe(413);
    await app.close();
  });
});
