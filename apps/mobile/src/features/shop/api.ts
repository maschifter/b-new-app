import { apiUrl, authHeaders, jsonHeaders, unwrapApiSuccess } from "@/lib/api/client";
import type {
  Inventory,
  InventoryItem,
  PurchaseItemBody,
  PurchaseItemResult,
  Wallet,
} from "@bnewapp/types";

function parseWallet(value: unknown): Wallet {
  if (
    typeof value !== "object" ||
    value === null ||
    !("glow" in value) ||
    typeof value.glow !== "number" ||
    !Number.isSafeInteger(value.glow) ||
    value.glow < 0
  ) {
    throw new Error("Invalid wallet response");
  }
  return { glow: value.glow };
}

function parseInventoryItem(value: unknown): InventoryItem {
  if (
    typeof value !== "object" ||
    value === null ||
    !("itemId" in value) ||
    typeof value.itemId !== "string" ||
    !("acquiredAt" in value) ||
    typeof value.acquiredAt !== "string"
  ) {
    throw new Error("Invalid inventory response");
  }
  return { itemId: value.itemId, acquiredAt: value.acquiredAt };
}

function parseInventory(value: unknown): Inventory {
  if (
    typeof value !== "object" ||
    value === null ||
    !("items" in value) ||
    !Array.isArray(value.items)
  ) {
    throw new Error("Invalid inventory response");
  }
  return { items: value.items.map(parseInventoryItem) };
}

function parsePurchaseResult(value: unknown): PurchaseItemResult {
  if (typeof value !== "object" || value === null || !("wallet" in value) || !("item" in value)) {
    throw new Error("Invalid purchase response");
  }
  return { wallet: parseWallet(value.wallet), item: parseInventoryItem(value.item) };
}

export async function getWallet(accessToken: string): Promise<Wallet> {
  const response = await fetch(`${apiUrl}/api/shop/wallet`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess(response, "Unable to load your Glow balance", {
    parse: parseWallet,
    serverError: true,
  });
}

export async function getInventory(accessToken: string): Promise<Inventory> {
  const response = await fetch(`${apiUrl}/api/shop/inventory`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess(response, "Unable to load your inventory", {
    parse: parseInventory,
    serverError: true,
  });
}

export async function purchaseItem(
  accessToken: string,
  body: PurchaseItemBody,
): Promise<PurchaseItemResult> {
  const response = await fetch(`${apiUrl}/api/shop/purchase`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(body),
  });
  return unwrapApiSuccess(response, "Unable to purchase this item", {
    parse: parsePurchaseResult,
    serverError: true,
  });
}
