import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { shopRoutes } from "../src/modules/shop/routes.js";
import {
  InsufficientGlowError,
  ShopItemNotFoundError,
  ShopUnavailableError,
  createShopService,
} from "../src/modules/shop/shop-service.js";

const testConfig = {
  NODE_ENV: "test",
  PORT: 3000,
  HOST: "127.0.0.1",
  LOG_LEVEL: "fatal",
  RATE_LIMIT_MAX: 120,
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "test-secret-key",
} as const;

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queryBuilder(result: QueryResult) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () => builder;
  for (const method of ["select", "eq", "in", "order", "update"]) {
    builder[method] = vi.fn(chain);
  }
  builder.upsert = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  // biome-ignore lint/suspicious/noThenProperty: mirrors Supabase's awaitable query builder
  builder.then = vi.fn((onfulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onfulfilled),
  );
  return builder;
}

describe("shop routes", () => {
  it("requires authentication for every economy endpoint", async () => {
    const app = await buildApp(testConfig);

    const wallet = await app.inject({ method: "GET", url: "/api/shop/wallet" });
    const inventory = await app.inject({ method: "GET", url: "/api/shop/inventory" });
    const purchase = await app.inject({
      method: "POST",
      url: "/api/shop/purchase",
      payload: { itemId: "plant" },
    });

    expect(wallet.statusCode).toBe(401);
    expect(inventory.statusCode).toBe(401);
    expect(purchase.statusCode).toBe(401);
    await app.close();
  });

  it("maps purchase outcomes to the API contract and client status codes", async () => {
    type Handler = (request: { user: { sub: string }; body?: unknown }) => Promise<unknown>;
    const handlers: Record<string, Handler> = {};
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            out_status: "ok",
            out_glow: 900,
            out_acquired_at: "2026-08-24T08:00:00.000Z",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ out_status: "insufficient_glow", out_glow: 10, out_acquired_at: null }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ out_status: "not_found", out_glow: null, out_acquired_at: null }],
        error: null,
      });
    const capture = (method: string) =>
      vi.fn((path: string, _options: unknown, handler: Handler) => {
        handlers[`${method} ${path}`] = handler;
      });
    const httpError = (statusCode: number, message: string) =>
      Object.assign(new Error(message), { statusCode });
    const app = {
      authenticate: vi.fn(),
      get: capture("GET"),
      post: capture("POST"),
      supabase: { rpc },
      httpErrors: {
        badRequest: (message: string) => httpError(400, message),
        notFound: (message: string) => httpError(404, message),
        internalServerError: (message: string) => httpError(500, message),
      },
    };
    await shopRoutes(app as never);
    const purchase = handlers["POST /purchase"];
    if (!purchase) throw new Error("Purchase route was not registered");

    await expect(purchase({ user: { sub: "user-1" }, body: {} })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      purchase({ user: { sub: "user-1" }, body: { itemId: "neon-lamp" } }),
    ).resolves.toEqual({
      data: {
        wallet: { glow: 900 },
        item: { itemId: "neon-lamp", acquiredAt: "2026-08-24T08:00:00.000Z" },
      },
    });
    await expect(
      purchase({ user: { sub: "user-1" }, body: { itemId: "neon-lamp" } }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      purchase({ user: { sub: "user-1" }, body: { itemId: "missing" } }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("shop bootstrap", () => {
  it("grants starter and valid placed items once, then honors the guard", async () => {
    const walletInsert = queryBuilder({ data: null, error: null });
    const walletPending = queryBuilder({ data: { starter_granted: false }, error: null });
    const starterItems = queryBuilder({
      data: [{ id: "plant" }, { id: "free-rug" }],
      error: null,
    });
    const room = queryBuilder({
      data: {
        map: {
          decor: { source: "catalog", id: "plant" },
          wall: { source: "catalog", id: "premium-poster" },
          stale: { source: "catalog", id: "deleted-item" },
          video: { source: "video", id: "clip-1" },
        },
      },
      error: null,
    });
    const validPlaced = queryBuilder({
      data: [{ id: "plant" }, { id: "premium-poster" }],
      error: null,
    });
    const starterGrant = queryBuilder({ data: null, error: null });
    const backfillGrant = queryBuilder({ data: null, error: null });
    const markGranted = queryBuilder({ data: null, error: null });
    const secondWalletInsert = queryBuilder({ data: null, error: null });
    const walletGranted = queryBuilder({ data: { starter_granted: true }, error: null });
    const supabase = {
      from: vi
        .fn()
        .mockReturnValueOnce(walletInsert)
        .mockReturnValueOnce(walletPending)
        .mockReturnValueOnce(starterItems)
        .mockReturnValueOnce(room)
        .mockReturnValueOnce(validPlaced)
        .mockReturnValueOnce(starterGrant)
        .mockReturnValueOnce(backfillGrant)
        .mockReturnValueOnce(markGranted)
        .mockReturnValueOnce(secondWalletInsert)
        .mockReturnValueOnce(walletGranted),
    };
    const service = createShopService(supabase as never);

    await service.ensureBootstrap("user-1");
    await service.ensureBootstrap("user-1");

    expect(starterGrant.upsert).toHaveBeenCalledWith(
      [
        { owner_id: "user-1", item_id: "plant", source: "starter" },
        { owner_id: "user-1", item_id: "free-rug", source: "starter" },
      ],
      { onConflict: "owner_id,item_id", ignoreDuplicates: true },
    );
    expect(backfillGrant.upsert).toHaveBeenCalledWith(
      [{ owner_id: "user-1", item_id: "premium-poster", source: "backfill" }],
      { onConflict: "owner_id,item_id", ignoreDuplicates: true },
    );
    expect(validPlaced.in).toHaveBeenCalledWith("id", ["plant", "premium-poster", "deleted-item"]);
    expect(markGranted.update).toHaveBeenCalledWith({ starter_granted: true });
    expect(supabase.from).toHaveBeenCalledTimes(10);
  });

  it("bootstraps when inventory is the user's first economy request", async () => {
    const walletInsert = queryBuilder({ data: null, error: null });
    const walletGranted = queryBuilder({ data: { starter_granted: true }, error: null });
    const inventory = queryBuilder({
      data: [
        { item_id: "neon-lamp", acquired_at: "2026-08-24T08:01:00.000Z" },
        { item_id: "plant", acquired_at: "2026-08-24T08:00:00.000Z" },
      ],
      error: null,
    });
    const supabase = {
      from: vi
        .fn()
        .mockReturnValueOnce(walletInsert)
        .mockReturnValueOnce(walletGranted)
        .mockReturnValueOnce(inventory),
    };
    const service = createShopService(supabase as never);

    await expect(service.getInventory("user-1")).resolves.toEqual({
      items: [
        { itemId: "neon-lamp", acquiredAt: "2026-08-24T08:01:00.000Z" },
        { itemId: "plant", acquiredAt: "2026-08-24T08:00:00.000Z" },
      ],
    });
    expect(inventory.order).toHaveBeenCalledWith("acquired_at", { ascending: false });
  });
});

describe("shop purchases", () => {
  function serviceFor(status: string, glow: number | null, acquiredAt: string | null) {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ out_status: status, out_glow: glow, out_acquired_at: acquiredAt }],
      error: null,
    });
    return { rpc, service: createShopService({ rpc } as never) };
  }

  it.each(["ok", "already_owned"])("maps %s to an idempotent purchase result", async (status) => {
    const { rpc, service } = serviceFor(status, 999_749, "2026-08-24T08:00:00.000Z");

    await expect(service.purchase("user-1", "neon-lamp")).resolves.toEqual({
      wallet: { glow: 999_749 },
      item: { itemId: "neon-lamp", acquiredAt: "2026-08-24T08:00:00.000Z" },
    });
    expect(rpc).toHaveBeenCalledWith("purchase_item", {
      p_owner: "user-1",
      p_item: "neon-lamp",
    });
  });

  it("maps an insufficient balance to a client error", async () => {
    const { service } = serviceFor("insufficient_glow", 20, null);
    await expect(service.purchase("user-1", "neon-lamp")).rejects.toBeInstanceOf(
      InsufficientGlowError,
    );
  });

  it("maps an unavailable item to not found", async () => {
    const { service } = serviceFor("not_found", null, null);
    await expect(service.purchase("user-1", "missing")).rejects.toBeInstanceOf(
      ShopItemNotFoundError,
    );
  });

  it("rejects an empty RPC result as an internal data failure", async () => {
    const service = createShopService({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as never);
    await expect(service.purchase("user-1", "plant")).rejects.toBeInstanceOf(ShopUnavailableError);
  });
});
