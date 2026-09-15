import { CATALOG } from "@bnewapp/studio-core";
import { describe, expect, it, vi } from "vitest";
import { catalogRoutes } from "../src/modules/catalog/routes.js";
import { CatalogUnavailableError, createCatalogService } from "../src/modules/catalog/service.js";
import { queryBuilder as itemsBuilder } from "./helpers/supabase.js";

const CATALOG_ROW = {
  id: "remote-plant",
  tags: { type: "decor", size: "S" },
  display_name: "Remote Plant",
  art_url: "https://example.com/remote-plant.webp",
  art_hitbox: {
    size: { width: 100, height: 200 },
    opaqueBounds: { x: 10, y: 20, width: 80, height: 160 },
  },
  status: "published",
  access: "free",
  price: null,
  sort_order: 10,
};

// Local rather than the shared queryBuilder: the catalog service reads the meta
// version twice per refresh, so `single()` has to hand back a different result on
// each call instead of resolving one fixed result.
function versionBuilder(results: Array<{ data: unknown; error: unknown }>) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  for (const result of results) builder.single.mockResolvedValueOnce(result);
  return builder;
}

function catalogSupabase(
  versions: Array<{ data: unknown; error: unknown }>,
  itemResults: Array<{ data: unknown; error: unknown }>,
) {
  const meta = versionBuilder(versions);
  const items = itemResults.map((result) => itemsBuilder(result));
  let itemIndex = 0;
  const from = vi.fn((table: string) => {
    if (table === "catalog_meta") return meta;
    const builder = items[itemIndex];
    itemIndex += 1;
    if (!builder) throw new Error("Missing catalog item query result");
    return builder;
  });
  return { client: { from }, from, meta, items };
}

describe("catalog service", () => {
  it("maps published rows and serves subsequent reads from the TTL cache", async () => {
    const supabase = catalogSupabase(
      [
        { data: { version: 3 }, error: null },
        { data: { version: 3 }, error: null },
      ],
      [{ data: [CATALOG_ROW], error: null }],
    );
    const service = createCatalogService(supabase.client as never);

    const first = await service.getForRead();
    const second = await service.getForRead();

    expect(first).toEqual({
      version: 3,
      items: [
        {
          id: "remote-plant",
          tags: { type: "decor", size: "S" },
          name: "Remote Plant",
          status: "published",
          access: "free",
          art: {
            url: "https://example.com/remote-plant.webp",
            hitbox: CATALOG_ROW.art_hitbox,
          },
        },
      ],
    });
    expect(second).toBe(first);
    expect(supabase.from).toHaveBeenCalledTimes(3);
    expect(supabase.items[0]?.not).toHaveBeenCalledWith("art_url", "is", null);
  });

  it("falls back to the bundled seed on a first read failure", async () => {
    const supabase = catalogSupabase([{ data: null, error: { message: "offline" } }], []);
    const warn = vi.fn();
    const service = createCatalogService(supabase.client as never, { warn });

    const result = await service.getForRead();

    expect(result.version).toBe(0);
    expect(result.items).toHaveLength(CATALOG.length);
    expect(result.items[0]).toMatchObject({
      name: "Big Screen",
      status: "published",
      access: "free",
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("reloads a stale cache before a write when the database version changes", async () => {
    const supabase = catalogSupabase(
      [
        { data: { version: 1 }, error: null },
        { data: { version: 1 }, error: null },
        { data: { version: 2 }, error: null },
        { data: { version: 2 }, error: null },
        { data: { version: 2 }, error: null },
      ],
      [
        { data: [{ ...CATALOG_ROW, id: "old-item", display_name: "Old Item" }], error: null },
        { data: [CATALOG_ROW], error: null },
      ],
    );
    const service = createCatalogService(supabase.client as never);
    await service.getForRead();

    const items = await service.getForWrite();

    expect(items.map((item) => item.id)).toEqual(["remote-plant"]);
    expect(supabase.items).toHaveLength(2);
    expect(supabase.items[1]?.then).toHaveBeenCalledOnce();
  });

  it("fails writes instead of reconciling against the bundled fallback", async () => {
    const supabase = catalogSupabase([{ data: null, error: { message: "offline" } }], []);
    const service = createCatalogService(supabase.client as never);

    await expect(service.getForWrite()).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it("fails authoritative reads instead of returning the bundled fallback", async () => {
    const supabase = catalogSupabase([{ data: null, error: { message: "offline" } }], []);
    const service = createCatalogService(supabase.client as never);

    await expect(service.getAuthoritative()).rejects.toBeInstanceOf(CatalogUnavailableError);
  });
});

describe("catalog route", () => {
  it("returns 503 when an authoritative catalog cannot be loaded", async () => {
    let handler: (() => Promise<unknown>) | undefined;
    const app = {
      authenticate: vi.fn(),
      catalogService: {
        getAuthoritative: vi.fn().mockRejectedValue(new CatalogUnavailableError()),
      },
      get: vi.fn((_path: string, _options: unknown, routeHandler: () => Promise<unknown>) => {
        handler = routeHandler;
      }),
      httpErrors: {
        serviceUnavailable: (message: string) =>
          Object.assign(new Error(message), { statusCode: 503 }),
      },
    };
    await catalogRoutes(app as never);
    if (!handler) throw new Error("Catalog route was not registered");

    await expect(handler()).rejects.toMatchObject({ statusCode: 503 });
  });
});
