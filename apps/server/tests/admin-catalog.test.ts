import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createAdminCatalogService } from "../src/modules/admin/catalog-service.js";

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

const httpErrors = {
  conflict: (message: string) => httpError(409, message),
  notFound: (message: string) => httpError(404, message),
  internalServerError: (message: string) => httpError(500, message),
};

function builder(result: { data: unknown; error: unknown; count?: number }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () => query;
  for (const method of [
    "select",
    "order",
    "range",
    "or",
    "eq",
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

const ROW = {
  id: "new-plant",
  tags: { type: "decor", size: "S" },
  display_name: "New Plant",
  art_url: null,
  art_hitbox: null,
  blurhash: null,
  status: "draft",
  access: "free",
  price: null,
  sort_order: 40,
  created_at: "2026-08-21T00:00:00.000Z",
  updated_at: "2026-08-21T00:00:00.000Z",
};

function serviceFor(query: ReturnType<typeof builder>, invalidate = vi.fn()) {
  const supabase = { from: vi.fn().mockReturnValue(query) };
  return {
    service: createAdminCatalogService(supabase as never, httpErrors as never, invalidate),
    supabase,
    invalidate,
  };
}

describe("admin catalog service", () => {
  it("lists, filters, sorts, and paginates catalog rows", async () => {
    const query = builder({ data: [ROW], error: null, count: 12 });
    const { service } = serviceFor(query);

    const result = await service.list({
      start: 10,
      end: 20,
      sort: "display_name",
      order: "asc",
      q: "plant",
      status: "draft",
      access: "free",
      type: "decor",
    });

    expect(result).toEqual({ rows: [ROW], total: 12 });
    expect(query.order).toHaveBeenCalledWith("display_name", { ascending: true });
    expect(query.range).toHaveBeenCalledWith(10, 19);
    expect(query.or).toHaveBeenCalledWith(
      "display_name.ilike.%plant%,id.ilike.%plant%,tags->>type.ilike.%plant%",
    );
    expect(query.eq).toHaveBeenCalledWith("status", "draft");
    expect(query.eq).toHaveBeenCalledWith("access", "free");
    expect(query.eq).toHaveBeenCalledWith("tags->>type", "decor");
  });

  it("creates an item and invalidates the published catalog cache", async () => {
    const query = builder({ data: ROW, error: null });
    const { service, invalidate } = serviceFor(query);

    const result = await service.create({
      id: ROW.id,
      tags: ROW.tags,
      display_name: ROW.display_name,
      status: "draft",
      access: "free",
      sort_order: 40,
    });

    expect(result).toEqual(ROW);
    expect(query.insert).toHaveBeenCalledWith({
      id: ROW.id,
      tags: ROW.tags,
      display_name: ROW.display_name,
      status: "draft",
      access: "free",
      sort_order: 40,
    });
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("maps duplicate ids to 409 without invalidating the cache", async () => {
    const query = builder({ data: null, error: { code: "23505" } });
    const { service, invalidate } = serviceFor(query);

    await expect(
      service.create({
        id: ROW.id,
        tags: ROW.tags,
        display_name: ROW.display_name,
        status: "draft",
        access: "free",
        sort_order: 40,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("returns 404 when updating or deleting a missing item", async () => {
    const updateQuery = builder({ data: null, error: null });
    const deleteQuery = builder({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValueOnce(updateQuery).mockReturnValueOnce(deleteQuery),
    };
    const service = createAdminCatalogService(supabase as never, httpErrors as never, vi.fn());

    await expect(service.update("missing", { display_name: "Missing" })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.delete("missing")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("uploads immutable WEBP art and saves its alpha-aware hit-box", async () => {
    const getQuery = builder({ data: ROW, error: null });
    const updatedRow = { ...ROW, art_url: "https://example.com/new-plant.webp" };
    const updateQuery = builder({ data: updatedRow, error: null });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: updatedRow.art_url },
    });
    const bucket = { upload, getPublicUrl };
    const invalidate = vi.fn();
    const supabase = {
      from: vi.fn().mockReturnValueOnce(getQuery).mockReturnValueOnce(updateQuery),
      storage: { from: vi.fn().mockReturnValue(bucket) },
    };
    const service = createAdminCatalogService(supabase as never, httpErrors as never, invalidate);
    const image = await sharp({
      create: { width: 20, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    const result = await service.uploadArt(ROW.id, image);

    expect(result).toEqual(updatedRow);
    expect(upload).toHaveBeenCalledOnce();
    const uploadCall = upload.mock.calls[0];
    expect(uploadCall?.[0]).toMatch(new RegExp(`^${ROW.id}/[a-f0-9]{64}\\.webp$`));
    expect(uploadCall?.[2]).toEqual({
      contentType: "image/webp",
      cacheControl: "31536000, immutable",
      upsert: false,
    });
    expect(updateQuery.update).toHaveBeenCalledWith({
      art_url: updatedRow.art_url,
      art_hitbox: {
        size: { width: 20, height: 10 },
        opaqueBounds: { x: 0, y: 0, width: 20, height: 10 },
      },
    });
    expect(invalidate).toHaveBeenCalledOnce();
  });
});
