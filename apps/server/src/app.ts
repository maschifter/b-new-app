import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import type { Env } from "./config.js";
import { errorHandlerPlugin } from "./lib/errors.js";
import { healthRoutes } from "./modules/health/routes.js";
import { userRoutes } from "./modules/user/routes.js";
import { authPlugin } from "./plugins/auth.js";

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
  await app.register(jwt, { secret: config.SUPABASE_SERVICE_ROLE_KEY ?? "development-only-secret" });
  await app.register(authPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(healthRoutes);
  await app.register(userRoutes, { prefix: "/api/user" });
  return app;
}
