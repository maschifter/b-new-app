import cors from "@fastify/cors";
import jwt, { type TokenOrHeader } from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import type { FastifyRequest } from "fastify";
import Fastify from "fastify";
import buildGetJwks from "get-jwks";
import type { Env } from "./config.js";
import { errorHandlerPlugin } from "./lib/errors.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { catalogRoutes } from "./modules/catalog/routes.js";
import { devRoutes } from "./modules/dev/routes.js";
import { danceRoutes } from "./modules/dance/routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import { shopRoutes } from "./modules/shop/routes.js";
import { studioRoutes } from "./modules/studio/routes.js";
import { userRoutes } from "./modules/user/routes.js";
import { authPlugin } from "./plugins/auth.js";
import { catalogPlugin } from "./plugins/catalog.js";
import { supabasePlugin } from "./plugins/supabase.js";

export async function buildApp(config: Env) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === "development" && { transport: { target: "pino-pretty" } }),
    },
  });
  await app.register(sensible);
  const allowedOrigins = config.ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  await app.register(cors, {
    origin:
      config.NODE_ENV === "development"
        ? true
        : allowedOrigins && allowedOrigins.length > 0
          ? allowedOrigins
          : false,
    exposedHeaders: ["Content-Range"],
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
  });
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
  await app.register(catalogPlugin);
  await app.register(authPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(healthRoutes);
  await app.register(userRoutes, { prefix: "/api/user" });
  await app.register(catalogRoutes, { prefix: "/api/studio" });
  await app.register(studioRoutes, { prefix: "/api/studio" });
  await app.register(shopRoutes, { prefix: "/api/shop" });
  await app.register(danceRoutes, { prefix: "/api/dance" });
  await app.register(adminRoutes, { prefix: "/api/admin" });
  if (config.NODE_ENV === "development" && config.DEV_ADMIN_SECRET) {
    await app.register(devRoutes, {
      prefix: "/dev",
      adminSecret: config.DEV_ADMIN_SECRET,
    });
  }
  return app;
}
