import type {
  ApiSuccess,
  Inventory,
  PurchaseItemBody,
  PurchaseItemResult,
  Wallet,
} from "@bnewapp/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  InsufficientGlowError,
  ShopItemNotFoundError,
  ShopUnavailableError,
  createShopService,
} from "./shop-service.js";

const purchaseItemBodySchema = z.object({ itemId: z.string().min(1) });

function mapShopError(app: FastifyInstance, error: unknown): never {
  if (error instanceof ShopItemNotFoundError) throw app.httpErrors.notFound(error.message);
  if (error instanceof InsufficientGlowError) throw app.httpErrors.badRequest(error.message);
  if (error instanceof ShopUnavailableError) {
    throw app.httpErrors.internalServerError("Could not load shop data");
  }
  throw error;
}

export async function shopRoutes(app: FastifyInstance) {
  const shop = createShopService(app.supabase);

  app.get(
    "/wallet",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<Wallet>> => {
      try {
        return { data: await shop.getWallet(request.user.sub) };
      } catch (error) {
        return mapShopError(app, error);
      }
    },
  );

  app.get(
    "/inventory",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<Inventory>> => {
      try {
        return { data: await shop.getInventory(request.user.sub) };
      } catch (error) {
        return mapShopError(app, error);
      }
    },
  );

  app.post(
    "/purchase",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<PurchaseItemResult>> => {
      const body = purchaseItemBodySchema.safeParse(request.body);
      if (!body.success) throw app.httpErrors.badRequest("Invalid purchase request");
      try {
        return { data: await shop.purchase(request.user.sub, body.data.itemId) };
      } catch (error) {
        return mapShopError(app, error);
      }
    },
  );
}
