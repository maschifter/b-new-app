import type { User } from "@supabase/supabase-js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const AUTH_USERS_PAGE_SIZE = 1000;

const CreateUserRequest = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const GrantAdminRequest = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "user"]).default("admin"),
});

export interface DevRoutesOptions {
  adminSecret: string;
}

export async function devRoutes(fastify: FastifyInstance, options: DevRoutesOptions) {
  async function requireDevSecret(request: FastifyRequest, reply: FastifyReply) {
    if (request.headers["x-admin-secret"] !== options.adminSecret) {
      return reply.unauthorized("Invalid or missing x-admin-secret header");
    }
  }

  fastify.post("/create-user", { preHandler: requireDevSecret }, async (request, reply) => {
    const body = CreateUserRequest.safeParse(request.body);
    if (!body.success) throw fastify.httpErrors.badRequest("Invalid create-user request");
    const { email, password } = body.data;
    const { data, error } = await fastify.supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) return reply.badRequest(error.message);
    return { id: data.user.id, email: data.user.email };
  });

  fastify.post("/grant-admin", { preHandler: requireDevSecret }, async (request, reply) => {
    const body = GrantAdminRequest.safeParse(request.body);
    if (!body.success) throw fastify.httpErrors.badRequest("Invalid grant-admin request");
    const { email, role } = body.data;
    let page = 1;
    let user: User | undefined;
    while (!user) {
      const { data, error } = await fastify.supabase.auth.admin.listUsers({
        page,
        perPage: AUTH_USERS_PAGE_SIZE,
      });
      if (error) return reply.badRequest(error.message);

      user = data.users.find((candidate) => candidate.email === email);
      if (!user && data.users.length < AUTH_USERS_PAGE_SIZE) {
        return reply.notFound(`No user found with email: ${email}`);
      }
      page += 1;
    }

    const nextRole = role === "admin" ? "admin" : null;
    const { error: updateError } = await fastify.supabase.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, role: nextRole },
    });
    if (updateError) return reply.badRequest(updateError.message);
    return { id: user.id, email, role: nextRole };
  });
}
