import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { type CatalogService, createCatalogService } from "../modules/catalog/service.js";

declare module "fastify" {
  interface FastifyInstance {
    catalogService: CatalogService;
  }
}

export const catalogPlugin = fp(async (app: FastifyInstance) => {
  app.decorate("catalogService", createCatalogService(app.supabase, app.log));
});
