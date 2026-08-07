import type { ApiSuccess, UserProfile } from "@bnewapp/types";
import type { FastifyInstance } from "fastify";

export async function userRoutes(app: FastifyInstance) {
  app.get(
    "/me",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<UserProfile>> => {
      const { data: profile, error } = await app.supabase
        .from("profiles")
        .select("id, email, created_at")
        .eq("id", request.user.sub)
        .maybeSingle();

      if (error) throw app.httpErrors.internalServerError("Could not load the user profile");
      if (!profile) throw app.httpErrors.notFound("User profile not found");

      return {
        data: {
          id: profile.id,
          email: profile.email,
          createdAt: profile.created_at,
        },
      };
    },
  );
}
