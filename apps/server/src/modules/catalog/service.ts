import { CATALOG, defaultItemLabel } from "@bnewapp/studio-core";
import type { CatalogItemDTO, Database, StudioCatalog } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const CACHE_TTL_MS = 45_000;

const tagsSchema = z.record(z.union([z.string(), z.array(z.string())]));
const hitBoxSchema = z.object({
  size: z.object({ width: z.number().positive(), height: z.number().positive() }),
  opaqueBounds: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
});
const statusSchema = z.enum(["draft", "published"]);
const accessSchema = z.enum(["free", "premium"]);

const FALLBACK_ITEMS: CatalogItemDTO[] = CATALOG.map((item) => ({
  ...item,
  name: defaultItemLabel(item.id),
  status: "published",
  access: "free",
}));

type CatalogRow = Pick<
  Database["public"]["Tables"]["catalog_items"]["Row"],
  | "id"
  | "tags"
  | "display_name"
  | "art_url"
  | "art_hitbox"
  | "status"
  | "access"
  | "price"
  | "sort_order"
>;

interface CatalogCache {
  data: StudioCatalog;
  expiresAt: number;
}

interface CatalogLogger {
  warn: (bindings: object, message: string) => void;
}

export class CatalogUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Catalog is temporarily unavailable", options);
    this.name = "CatalogUnavailableError";
  }
}

function mapCatalogRow(row: CatalogRow): CatalogItemDTO {
  const tags = tagsSchema.parse(row.tags);
  const status = statusSchema.parse(row.status);
  const access = accessSchema.parse(row.access);
  const hitbox = row.art_hitbox === null ? undefined : hitBoxSchema.parse(row.art_hitbox);

  return {
    id: row.id,
    tags,
    name: row.display_name,
    status,
    access,
    ...(row.price === null ? {} : { price: row.price }),
    ...(row.art_url === null
      ? {}
      : { art: { url: row.art_url, ...(hitbox === undefined ? {} : { hitbox }) } }),
  };
}

export function createCatalogService(
  supabase: SupabaseClient<Database>,
  logger?: CatalogLogger,
) {
  let cache: CatalogCache | null = null;

  async function loadVersion(): Promise<number> {
    const { data, error } = await supabase
      .from("catalog_meta")
      .select("version")
      .eq("id", 1)
      .single();
    if (error || !data) throw new CatalogUnavailableError({ cause: error });
    return data.version;
  }

  async function loadItems(): Promise<CatalogItemDTO[]> {
    const { data, error } = await supabase
      .from("catalog_items")
      .select(
        "id, tags, display_name, art_url, art_hitbox, status, access, price, sort_order",
      )
      .eq("status", "published")
      .not("art_url", "is", null)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw new CatalogUnavailableError({ cause: error });
    return (data ?? []).map(mapCatalogRow);
  }

  async function loadStableCatalog(): Promise<StudioCatalog> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const versionBefore = await loadVersion();
      const items = await loadItems();
      const versionAfter = await loadVersion();
      if (versionBefore === versionAfter) return { version: versionAfter, items };
    }
    throw new CatalogUnavailableError();
  }

  async function refresh(): Promise<StudioCatalog> {
    const data = await loadStableCatalog();
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    return data;
  }

  async function loadAuthoritative(): Promise<StudioCatalog> {
    try {
      const currentVersion = await loadVersion();
      if (cache?.data.version === currentVersion) return cache.data;
      return await refresh();
    } catch (error) {
      if (error instanceof CatalogUnavailableError) throw error;
      throw new CatalogUnavailableError({ cause: error });
    }
  }

  return {
    async getForRead(): Promise<StudioCatalog> {
      if (cache && cache.expiresAt > Date.now()) return cache.data;
      try {
        return await refresh();
      } catch (error) {
        logger?.warn({ error }, "Using fallback studio catalog after a database read failure");
        return cache?.data ?? { version: 0, items: FALLBACK_ITEMS };
      }
    },

    getAuthoritative: loadAuthoritative,

    async getForWrite(): Promise<CatalogItemDTO[]> {
      return (await loadAuthoritative()).items;
    },

    invalidate(): void {
      cache = null;
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
