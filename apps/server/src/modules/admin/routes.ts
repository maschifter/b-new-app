import type { FastifyInstance, FastifyRequest } from "fastify";
import { contentRange, parseListQuery } from "../../lib/react-admin.js";
import { InvalidCatalogArtError } from "../catalog/art.js";
import { createAdminCatalogService } from "./catalog-service.js";
import {
  CatalogIdParam,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
} from "./catalog-schemas.js";
import { UpdateUserRequest, UserIdParam } from "./schemas.js";
import { createAdminService } from "./service.js";

export async function adminRoutes(fastify: FastifyInstance) {
  const service = createAdminService(fastify.supabase, fastify.httpErrors);
  const catalogService = createAdminCatalogService(
    fastify.supabase,
    fastify.httpErrors,
    fastify.catalogService.invalidate,
  );
  fastify.addHook("preHandler", fastify.requireAdmin);

  fastify.get("/users", async (request, reply) => {
    let listQuery: ReturnType<typeof parseListQuery>;
    try {
      listQuery = parseListQuery(request.query);
    } catch {
      throw fastify.httpErrors.badRequest("Invalid user list query");
    }
    const { start, end, sort, order, filter } = listQuery;
    const q = typeof filter.q === "string" ? filter.q : undefined;
    const { rows, total } = await service.listUsers({ start, end, sort, order, q });
    reply.header("Content-Range", contentRange("users", start, rows.length, total));
    return rows;
  });

  fastify.get("/users/:id", async (request) => {
    const params = UserIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid user id");
    const { id } = params.data;
    return service.getUser(id);
  });

  const updateUser = async (request: FastifyRequest) => {
    const params = UserIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid user id");
    const body = UpdateUserRequest.safeParse(request.body);
    if (!body.success) throw fastify.httpErrors.badRequest("Invalid user update");
    return service.updateUser(params.data.id, body.data);
  };
  fastify.patch("/users/:id", updateUser);
  fastify.put("/users/:id", updateUser);

  fastify.delete("/users/:id", async (request) => {
    const params = UserIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid user id");
    const { id } = params.data;
    return service.deleteUser(id);
  });

  fastify.get("/dashboard/summary", async () => service.getDashboardSummary());

  fastify.get("/catalog", async (request, reply) => {
    let listQuery: ReturnType<typeof parseListQuery>;
    try {
      listQuery = parseListQuery(request.query);
    } catch {
      throw fastify.httpErrors.badRequest("Invalid catalog list query");
    }
    const { start, end, sort, order, filter } = listQuery;
    const { rows, total } = await catalogService.list({
      start,
      end,
      sort,
      order,
      ...(typeof filter.q === "string" ? { q: filter.q } : {}),
      ...(typeof filter.status === "string" ? { status: filter.status } : {}),
      ...(typeof filter.access === "string" ? { access: filter.access } : {}),
      ...(typeof filter.type === "string" ? { type: filter.type } : {}),
    });
    reply.header("Content-Range", contentRange("catalog", start, rows.length, total));
    return rows;
  });

  fastify.get("/catalog/:id", async (request) => {
    const params = CatalogIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid catalog item id");
    return catalogService.get(params.data.id);
  });

  fastify.post("/catalog", async (request) => {
    const body = CreateCatalogItemRequest.safeParse(request.body);
    if (!body.success) throw fastify.httpErrors.badRequest("Invalid catalog item");
    return catalogService.create(body.data);
  });

  const updateCatalogItem = async (request: FastifyRequest) => {
    const params = CatalogIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid catalog item id");
    const body = UpdateCatalogItemRequest.safeParse(request.body);
    if (!body.success) throw fastify.httpErrors.badRequest("Invalid catalog item update");
    return catalogService.update(params.data.id, body.data);
  };
  fastify.patch("/catalog/:id", updateCatalogItem);
  fastify.put("/catalog/:id", updateCatalogItem);

  fastify.delete("/catalog/:id", async (request) => {
    const params = CatalogIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid catalog item id");
    return catalogService.delete(params.data.id);
  });

  fastify.post("/catalog/:id/art", async (request) => {
    const params = CatalogIdParam.safeParse(request.params);
    if (!params.success) throw fastify.httpErrors.badRequest("Invalid catalog item id");
    if (!request.isMultipart()) throw fastify.httpErrors.badRequest("Expected an image upload");

    const file = await request.file();
    if (!file) throw fastify.httpErrors.badRequest("Image file is required");
    try {
      return await catalogService.uploadArt(params.data.id, await file.toBuffer());
    } catch (error) {
      if (error instanceof InvalidCatalogArtError) {
        throw fastify.httpErrors.badRequest(error.message);
      }
      throw error;
    }
  });
}
