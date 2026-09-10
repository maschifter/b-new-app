import { createHash } from "node:crypto";
import type { Database } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyInstance } from "fastify";
import { processCatalogArt } from "../catalog/art.js";
import type { CreateCatalogItemBody, UpdateCatalogItemBody } from "./catalog-schemas.js";

const CATALOG_COLUMNS =
  "id, tags, display_name, art_url, art_hitbox, blurhash, status, access, price, sort_order, created_at, updated_at";
const SORTABLE_COLUMNS = new Set([
  "id",
  "display_name",
  "status",
  "access",
  "price",
  "sort_order",
  "created_at",
  "updated_at",
]);
const CHECK_CONSTRAINT_VIOLATION = "23514";
const ACCESS_PRICE_ERROR =
  "Free items must have no price; premium items require a positive Glow price";

type HttpErrors = FastifyInstance["httpErrors"];
type CatalogAdminRow = Database["public"]["Tables"]["catalog_items"]["Row"];

export interface ListCatalogOptions {
  start: number;
  end: number;
  sort: string;
  order: "asc" | "desc";
  q?: string | undefined;
  status?: string | undefined;
  access?: string | undefined;
  type?: string | undefined;
}

interface AdminCatalogService {
  list(options: ListCatalogOptions): Promise<{ rows: CatalogAdminRow[]; total: number }>;
  get(id: string): Promise<CatalogAdminRow>;
  create(body: CreateCatalogItemBody): Promise<CatalogAdminRow>;
  update(id: string, body: UpdateCatalogItemBody): Promise<CatalogAdminRow>;
  delete(id: string): Promise<{ id: string }>;
  uploadArt(id: string, input: Buffer): Promise<CatalogAdminRow>;
}

function catalogUpdate(body: UpdateCatalogItemBody) {
  return {
    ...(body.tags === undefined ? {} : { tags: body.tags }),
    ...(body.display_name === undefined ? {} : { display_name: body.display_name }),
    ...(body.status === undefined ? {} : { status: body.status }),
    ...(body.access === undefined ? {} : { access: body.access }),
    ...(body.price === undefined ? {} : { price: body.price }),
    ...(body.sort_order === undefined ? {} : { sort_order: body.sort_order }),
  };
}

export function createAdminCatalogService(
  supabase: SupabaseClient<Database>,
  httpErrors: HttpErrors,
  invalidateCatalog: () => void,
): AdminCatalogService {
  async function get(id: string): Promise<CatalogAdminRow> {
    const { data, error } = await supabase
      .from("catalog_items")
      .select(CATALOG_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw httpErrors.internalServerError("Could not load catalog item");
    if (!data) throw httpErrors.notFound("Catalog item not found");
    return data;
  }

  return {
    async list(options: ListCatalogOptions) {
      const sortColumn = SORTABLE_COLUMNS.has(options.sort) ? options.sort : "sort_order";
      let query = supabase
        .from("catalog_items")
        .select(CATALOG_COLUMNS, { count: "exact" })
        .order(sortColumn, { ascending: options.order === "asc" })
        .range(options.start, Math.max(options.end - 1, options.start));

      const search = options.q?.replace(/[,%]/g, "").trim();
      if (search) {
        query = query.or(
          `display_name.ilike.%${search}%,id.ilike.%${search}%,tags->>type.ilike.%${search}%`,
        );
      }
      if (options.status) query = query.eq("status", options.status);
      if (options.access) query = query.eq("access", options.access);
      if (options.type) query = query.eq("tags->>type", options.type);

      const { data, error, count } = await query;
      if (error) throw httpErrors.internalServerError("Could not load catalog items");
      const rows = data ?? [];
      return { rows, total: count ?? rows.length };
    },

    get,

    async create(body: CreateCatalogItemBody) {
      const payload = {
        id: body.id,
        tags: body.tags,
        display_name: body.display_name,
        status: body.status,
        access: body.access,
        sort_order: body.sort_order,
        ...(body.price === undefined ? {} : { price: body.price }),
      };
      const { data, error } = await supabase
        .from("catalog_items")
        .insert(payload)
        .select(CATALOG_COLUMNS)
        .single();
      if (error?.code === "23505") throw httpErrors.conflict("Catalog item id already exists");
      if (error?.code === CHECK_CONSTRAINT_VIOLATION) {
        throw httpErrors.badRequest(ACCESS_PRICE_ERROR);
      }
      if (error || !data) throw httpErrors.internalServerError("Could not create catalog item");
      invalidateCatalog();
      return data;
    },

    async update(id: string, body: UpdateCatalogItemBody) {
      const { data, error } = await supabase
        .from("catalog_items")
        .update(catalogUpdate(body))
        .eq("id", id)
        .select(CATALOG_COLUMNS)
        .maybeSingle();
      if (error?.code === CHECK_CONSTRAINT_VIOLATION) {
        throw httpErrors.badRequest(ACCESS_PRICE_ERROR);
      }
      if (error) throw httpErrors.internalServerError("Could not update catalog item");
      if (!data) throw httpErrors.notFound("Catalog item not found");
      invalidateCatalog();
      return data;
    },

    async delete(id: string) {
      const { data, error } = await supabase
        .from("catalog_items")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw httpErrors.internalServerError("Could not delete catalog item");
      if (!data) throw httpErrors.notFound("Catalog item not found");
      invalidateCatalog();
      return data;
    },

    async uploadArt(id: string, input: Buffer) {
      await get(id);
      const { bytes, hitbox } = await processCatalogArt(input);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const objectPath = `${id}/${hash}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("catalog-art")
        .upload(objectPath, bytes, {
          contentType: "image/webp",
          cacheControl: "31536000, immutable",
          upsert: false,
        });
      const duplicateUpload =
        uploadError?.message.toLowerCase().includes("already exists") === true;
      if (uploadError && !duplicateUpload) {
        throw httpErrors.internalServerError("Could not upload catalog art");
      }

      const { data: publicUrl } = supabase.storage.from("catalog-art").getPublicUrl(objectPath);
      const { data, error } = await supabase
        .from("catalog_items")
        .update({
          art_url: publicUrl.publicUrl,
          art_hitbox: {
            size: { width: hitbox.size.width, height: hitbox.size.height },
            opaqueBounds: {
              x: hitbox.opaqueBounds.x,
              y: hitbox.opaqueBounds.y,
              width: hitbox.opaqueBounds.width,
              height: hitbox.opaqueBounds.height,
            },
          },
        })
        .eq("id", id)
        .select(CATALOG_COLUMNS)
        .maybeSingle();
      if (error || !data) throw httpErrors.internalServerError("Could not save catalog art");
      invalidateCatalog();
      return data;
    },
  };
}
