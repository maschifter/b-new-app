import type { StudioCatalogResponse } from "@bnewapp/types";
import type { FastifyInstance } from "fastify";
import { CatalogUnavailableError } from "./service.js";

export async function catalogRoutes(app: FastifyInstance) {
  app.get(
    "/catalog",
    { preHandler: app.authenticate },
    async (): Promise<StudioCatalogResponse> => {
      try {
        return { data: await app.catalogService.getAuthoritative() };
      } catch (error) {
        if (error instanceof CatalogUnavailableError) {
          throw app.httpErrors.serviceUnavailable("Studio catalog is temporarily unavailable");
        }
        throw error;
      }
    },
  );
}
