import type { Database, Inventory, PurchaseItemResult, Wallet } from "@bnewapp/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export class ShopUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Shop data is temporarily unavailable", options);
    this.name = "ShopUnavailableError";
  }
}

export class ShopItemNotFoundError extends Error {
  constructor() {
    super("Item is not available for purchase");
    this.name = "ShopItemNotFoundError";
  }
}

export class InsufficientGlowError extends Error {
  constructor() {
    super("Not enough Glow to purchase this item");
    this.name = "InsufficientGlowError";
  }
}

function placedCatalogItemIds(map: unknown): string[] {
  if (typeof map !== "object" || map === null || Array.isArray(map)) return [];
  const ids = new Set<string>();
  for (const value of Object.values(map)) {
    if (
      typeof value === "object" &&
      value !== null &&
      "source" in value &&
      value.source === "catalog" &&
      "id" in value &&
      typeof value.id === "string"
    ) {
      ids.add(value.id);
    }
  }
  return [...ids];
}

function mapGlow(value: number | null): number {
  if (value === null || !Number.isSafeInteger(value) || value < 0) {
    throw new ShopUnavailableError();
  }
  return value;
}

export function createShopService(supabase: SupabaseClient<Database>) {
  async function ensureBootstrap(ownerId: string): Promise<void> {
    const { error: walletInsertError } = await supabase
      .from("user_wallets")
      .upsert({ owner_id: ownerId }, { onConflict: "owner_id", ignoreDuplicates: true });
    if (walletInsertError) throw new ShopUnavailableError({ cause: walletInsertError });

    const { data: wallet, error: walletError } = await supabase
      .from("user_wallets")
      .select("starter_granted")
      .eq("owner_id", ownerId)
      .single();
    if (walletError || !wallet) throw new ShopUnavailableError({ cause: walletError });
    if (wallet.starter_granted) return;

    const [{ data: starterRows, error: starterError }, { data: room, error: roomError }] =
      await Promise.all([
        supabase.from("catalog_items").select("id").eq("status", "published").eq("access", "free"),
        supabase.from("studio_rooms").select("map").eq("owner_id", ownerId).maybeSingle(),
      ]);
    if (starterError || roomError) {
      throw new ShopUnavailableError({ cause: starterError ?? roomError });
    }

    const starterIds = (starterRows ?? []).map(({ id }) => id);
    const placedIds = placedCatalogItemIds(room?.map);
    let existingPlacedIds: string[] = [];
    if (placedIds.length > 0) {
      const { data, error } = await supabase.from("catalog_items").select("id").in("id", placedIds);
      if (error) throw new ShopUnavailableError({ cause: error });
      existingPlacedIds = (data ?? []).map(({ id }) => id);
    }

    if (starterIds.length > 0) {
      const { error } = await supabase.from("user_items").upsert(
        starterIds.map((itemId) => ({ owner_id: ownerId, item_id: itemId, source: "starter" })),
        { onConflict: "owner_id,item_id", ignoreDuplicates: true },
      );
      if (error) throw new ShopUnavailableError({ cause: error });
    }

    const starterSet = new Set(starterIds);
    const backfillIds = existingPlacedIds.filter((itemId) => !starterSet.has(itemId));
    if (backfillIds.length > 0) {
      const { error } = await supabase.from("user_items").upsert(
        backfillIds.map((itemId) => ({ owner_id: ownerId, item_id: itemId, source: "backfill" })),
        { onConflict: "owner_id,item_id", ignoreDuplicates: true },
      );
      if (error) throw new ShopUnavailableError({ cause: error });
    }

    const { error: updateError } = await supabase
      .from("user_wallets")
      .update({ starter_granted: true })
      .eq("owner_id", ownerId);
    if (updateError) throw new ShopUnavailableError({ cause: updateError });
  }

  async function getWallet(ownerId: string): Promise<Wallet> {
    await ensureBootstrap(ownerId);
    const { data, error } = await supabase
      .from("user_wallets")
      .select("glow")
      .eq("owner_id", ownerId)
      .single();
    if (error || !data) throw new ShopUnavailableError({ cause: error });
    return { glow: mapGlow(data.glow) };
  }

  async function getInventory(ownerId: string): Promise<Inventory> {
    await ensureBootstrap(ownerId);
    const { data, error } = await supabase
      .from("user_items")
      .select("item_id, acquired_at")
      .eq("owner_id", ownerId)
      .order("acquired_at", { ascending: false });
    if (error) throw new ShopUnavailableError({ cause: error });
    return {
      items: (data ?? []).map((item) => ({
        itemId: item.item_id,
        acquiredAt: item.acquired_at,
      })),
    };
  }

  async function purchase(ownerId: string, itemId: string): Promise<PurchaseItemResult> {
    const { data, error } = await supabase.rpc("purchase_item", {
      p_owner: ownerId,
      p_item: itemId,
    });
    if (error) throw new ShopUnavailableError({ cause: error });
    const row = data?.[0];
    if (!row) throw new ShopUnavailableError();

    if (row.out_status === "not_found") throw new ShopItemNotFoundError();
    if (row.out_status === "insufficient_glow") throw new InsufficientGlowError();
    if (row.out_status !== "ok" && row.out_status !== "already_owned") {
      throw new ShopUnavailableError();
    }
    if (!row.out_acquired_at) throw new ShopUnavailableError();

    return {
      wallet: { glow: mapGlow(row.out_glow) },
      item: { itemId, acquiredAt: row.out_acquired_at },
    };
  }

  return { ensureBootstrap, getWallet, getInventory, purchase };
}

export type ShopService = ReturnType<typeof createShopService>;
