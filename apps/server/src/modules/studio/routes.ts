import {
  CATALOG,
  CURRENT_VERSION,
  coerceSnapshot,
  migrate,
  reconcile,
  ROOM_TEMPLATE,
  templateById,
} from "@bnewapp/studio-core";
import type { ApiSuccess, StudioRoom } from "@bnewapp/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const ROOM_COLUMNS = "id, owner_id, version, template_id, map, updated_at";
const saveRoomBodySchema = z.object({
  version: z.number().int().nonnegative().max(CURRENT_VERSION),
  templateId: z.string(),
  map: z.record(z.object({ source: z.enum(["catalog", "video"]), id: z.string() })),
});

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
      const snapshot = reconcile(migrated, template, CATALOG);

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
      const snapshot = reconcile(migrated, template, CATALOG);

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
}
