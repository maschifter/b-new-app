import cors from "@fastify/cors";
import jwt, { type TokenOrHeader } from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import type { FastifyRequest } from "fastify";
import Fastify from "fastify";
import buildGetJwks from "get-jwks";
import type { Env } from "./config.js";
import { errorHandlerPlugin } from "./lib/errors.js";
import { healthRoutes } from "./modules/health/routes.js";
import { userRoutes } from "./modules/user/routes.js";
import { authPlugin } from "./plugins/auth.js";
import { supabasePlugin } from "./plugins/supabase.js";

export async function buildApp(config: Env) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === "development" && { transport: { target: "pino-pretty" } }),
    },
  });
  await app.register(sensible);
  await app.register(cors, { origin: config.NODE_ENV === "development" });
  await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: "1 minute" });
  const getJwks = buildGetJwks();
  await app.register(jwt, {
    decode: { complete: true },
    secret: (_request: FastifyRequest, token: TokenOrHeader) => {
      const header = "header" in token ? token.header : token;
      return getJwks.getPublicKey({
        kid: header.kid,
        domain: `${config.SUPABASE_URL}/auth/v1`,
        alg: header.alg,
      });
    },
  });
  await app.register(supabasePlugin, {
    url: config.SUPABASE_URL,
    secretKey: config.SUPABASE_SECRET_KEY,
  });
  await app.register(authPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(healthRoutes);
  await app.register(userRoutes, { prefix: "/api/user" });
  return app;
}
