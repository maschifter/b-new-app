import type { FastifyRequest } from "fastify";
import fp from "fastify-plugin";

export interface AuthUser {
  sub: string;
  email?: string;
  role?: string;
  app_metadata?: { role?: string; [key: string]: unknown };
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    requireAdmin: (request: FastifyRequest) => Promise<void>;
  }
}

export function isAdmin(user: AuthUser): boolean {
  return user.app_metadata?.role === "admin";
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

export const authPlugin = fp(async (app) => {
  app.decorate("authenticate", async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw app.httpErrors.unauthorized("Invalid or expired token");
    }
  });

  app.decorate("requireAdmin", async (request) => {
    await app.authenticate(request);
    if (!isAdmin(request.user)) {
      throw app.httpErrors.forbidden("Admin access required");
    }
  });
});
