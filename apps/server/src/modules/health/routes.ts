import type { HealthStatus } from "@bnewapp/types";
import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (): Promise<HealthStatus> => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));
}
