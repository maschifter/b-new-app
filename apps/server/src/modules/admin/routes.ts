import type { FastifyInstance, FastifyRequest } from "fastify";
import { contentRange, parseListQuery } from "../../lib/react-admin.js";
import { UpdateUserRequest, UserIdParam } from "./schemas.js";
import { createAdminService } from "./service.js";

export async function adminRoutes(fastify: FastifyInstance) {
  const service = createAdminService(fastify.supabase, fastify.httpErrors);
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
}
