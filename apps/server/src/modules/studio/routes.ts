import {
  type CatalogItem,
  CURRENT_VERSION,
  coerceSnapshot,
  migrate,
  reconcile,
  ROOM_TEMPLATE,
  templateById,
} from "@bnewapp/studio-core";
import type { ApiSuccess, ExploreRoom, ExploreRoomsPage, StudioRoom } from "@bnewapp/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CatalogUnavailableError } from "../catalog/service.js";

const ROOM_COLUMNS = "id, owner_id, version, template_id, map, updated_at";

// Explore reads embed the owner's public handle. owner_id carries two FKs
// (auth.users + profiles); the constraint-name hint keeps the embed unambiguous.
const EXPLORE_COLUMNS =
  "id, owner_id, version, template_id, map, updated_at, profiles!studio_rooms_owner_profile_fk(username)";

const saveRoomBodySchema = z.object({
  version: z.number().int().nonnegative().max(CURRENT_VERSION),
  templateId: z.string(),
  map: z.record(z.object({ source: z.enum(["catalog", "video"]), id: z.string() })),
});

// limit + an all-or-nothing keyset cursor. Rejecting a half-specified cursor keeps
// the (updated_at, id) boundary well-defined on every page request.
const exploreQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(50).default(20),
    cursorUpdatedAt: z.string().datetime({ offset: true }).optional(),
    cursorId: z.string().uuid().optional(),
  })
  .refine((query) => (query.cursorUpdatedAt === undefined) === (query.cursorId === undefined), {
    message: "cursorUpdatedAt and cursorId must be provided together",
  });

const exploreParamsSchema = z.object({ ownerId: z.string().uuid() });

type ProfileEmbed = { username: string } | { username: string }[] | null;

interface RawExploreRow {
  id: string;
  owner_id: string;
  version: number;
  template_id: string;
  map: unknown;
  updated_at: string;
  profiles: ProfileEmbed;
}

function embeddedUsername(profiles: ProfileEmbed): string | null {
  if (!profiles) return null;
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  return profile?.username ?? null;
}

// Run the shared coerce -> migrate -> reconcile pipeline on a raw row and attach
// the owner's handle. Returns null when the row has no resolvable username, so it
// can never yield an ExploreRoom that violates the non-null username contract.
function buildExploreRoom(row: RawExploreRow, catalog: CatalogItem[]): ExploreRoom | null {
  const username = embeddedUsername(row.profiles);
  if (!username) return null;
  const migrated = migrate(
    coerceSnapshot({ version: row.version, templateId: row.template_id, map: row.map }),
  );
  const template = templateById(migrated.templateId) ?? ROOM_TEMPLATE;
  const snapshot = reconcile(migrated, template, catalog);
  return { ownerId: row.owner_id, snapshot, updatedAt: row.updated_at, username };
}

export async function studioRoutes(app: FastifyInstance) {
  // Load the caller's room. Returns null when they have never saved one, so the
  // client can seed from its local sample decoration.
  app.get(
    "/room",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<StudioRoom | null>> => {
      const { data: row, error } = await app.supabase
        .from("studio_rooms")
        .select(ROOM_COLUMNS)
        .eq("owner_id", request.user.sub)
        .maybeSingle();

      if (error) throw app.httpErrors.internalServerError("Could not load the studio room");
      if (!row) return { data: null };

      const migrated = migrate(
        coerceSnapshot({ version: row.version, templateId: row.template_id, map: row.map }),
      );
      const template = templateById(migrated.templateId) ?? ROOM_TEMPLATE;
      let catalog: CatalogItem[];
      try {
        catalog = (await app.catalogService.getAuthoritative()).items;
      } catch (error) {
        if (error instanceof CatalogUnavailableError) {
          throw app.httpErrors.serviceUnavailable("Studio catalog is temporarily unavailable");
        }
        throw error;
      }
      const snapshot = reconcile(migrated, template, catalog);

      return {
        data: { id: row.id, ownerId: row.owner_id, snapshot, updatedAt: row.updated_at },
      };
    },
  );

  // Upsert the caller's room. The incoming snapshot is coerced, migrated and
  // reconciled against the current template/catalog before it is stored, so the
  // database never holds an invalid placement.
  app.put(
    "/room",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<StudioRoom>> => {
      const body = saveRoomBodySchema.safeParse(request.body);
      if (!body.success) throw app.httpErrors.badRequest("Invalid studio room snapshot");

      const migrated = migrate(body.data);
      const template = templateById(migrated.templateId);
      if (!template) throw app.httpErrors.badRequest("Unknown studio template");
      let catalog: CatalogItem[];
      try {
        catalog = await app.catalogService.getForWrite();
      } catch (error) {
        if (error instanceof CatalogUnavailableError) {
          throw app.httpErrors.serviceUnavailable("Studio catalog is temporarily unavailable");
        }
        throw error;
      }
      const snapshot = reconcile(migrated, template, catalog);

      const { data: row, error } = await app.supabase
        .from("studio_rooms")
        .upsert(
          {
            owner_id: request.user.sub,
            version: snapshot.version,
            template_id: snapshot.templateId,
            map: snapshot.map,
          },
          { onConflict: "owner_id" },
        )
        .select(ROOM_COLUMNS)
        .single();

      if (error || !row) throw app.httpErrors.internalServerError("Could not save the studio room");

      return {
        data: { id: row.id, ownerId: row.owner_id, snapshot, updatedAt: row.updated_at },
      };
    },
  );

  // Explore feed: other users' non-empty rooms, newest first, keyset-paginated.
  app.get(
    "/rooms",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<ExploreRoomsPage>> => {
      const parsed = exploreQuerySchema.safeParse(request.query);
      if (!parsed.success) throw app.httpErrors.badRequest("Invalid explore query");
      const { limit, cursorUpdatedAt, cursorId } = parsed.data;
      const cursor =
        cursorUpdatedAt && cursorId ? { updatedAt: cursorUpdatedAt, id: cursorId } : null;

      let query = app.supabase
        .from("studio_rooms")
        .select(EXPLORE_COLUMNS)
        .neq("owner_id", request.user.sub)
        .neq("map", "{}")
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit + 1);

      // Descending keyset: everything strictly before the (updated_at, id) boundary.
      if (cursor) {
        query = query.or(
          `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`,
        );
      }

      const { data, error } = await query;
      if (error) throw app.httpErrors.internalServerError("Could not load explore rooms");

      const rows = data ?? [];
      const { items: catalog } = await app.catalogService.getForRead();
      // The extra row only proves more data exists; the cursor comes from the last
      // raw row we keep, computed before reconcile filtering so pagination never
      // depends on how many rooms survive as items.
      const hasMore = rows.length > limit;
      const consumed = hasMore ? rows.slice(0, limit) : rows;
      const boundary = consumed.at(-1);
      const nextCursor =
        hasMore && boundary ? { updatedAt: boundary.updated_at, id: boundary.id } : null;

      const items: ExploreRoom[] = [];
      for (const row of consumed) {
        const room = buildExploreRoom(row, catalog);
        // Drop rooms left empty after reconcile (only stale placements remained).
        if (room && Object.keys(room.snapshot.map).length > 0) items.push(room);
      }

      return { data: { items, nextCursor } };
    },
  );

  // A single other user's room, read-only. Not filtered by emptiness: the client
  // reaches it from the feed and a reconciled-empty room still renders as a bare stage.
  app.get(
    "/rooms/:ownerId",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<ExploreRoom | null>> => {
      const params = exploreParamsSchema.safeParse(request.params);
      if (!params.success) throw app.httpErrors.badRequest("Invalid room owner id");

      const { data, error } = await app.supabase
        .from("studio_rooms")
        .select(EXPLORE_COLUMNS)
        .eq("owner_id", params.data.ownerId)
        .maybeSingle();

      if (error) throw app.httpErrors.internalServerError("Could not load the room");
      if (!data) return { data: null };

      const { items: catalog } = await app.catalogService.getForRead();
      return { data: buildExploreRoom(data, catalog) };
    },
  );
}
