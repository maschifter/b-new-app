import type { ApiSuccess, UserProfile } from "@bnewapp/types";
import type { FastifyInstance } from "fastify";

export async function userRoutes(app: FastifyInstance) {
  app.get(
    "/me",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<UserProfile>> => ({
      data: { id: request.user.sub, email: request.user.email ?? null },
    }),
  );
}
