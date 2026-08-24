import { apiUrl } from "@/lib/api/client";
import type {
  Inventory,
  InventoryItem,
  PurchaseItemBody,
  PurchaseItemResult,
  Wallet,
} from "@bnewapp/types";

function errorMessage(value: unknown, fallback: string): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }
  return fallback;
}

function responseData(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    throw new Error("Invalid shop response");
  }
  return value.data;
}

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

async function readResponse<T>(
  response: Response,
  fallbackError: string,
  parse: (value: unknown) => T,
): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(errorMessage(body, fallbackError));
  return parse(responseData(body));
}

export async function getWallet(accessToken: string): Promise<Wallet> {
  const response = await fetch(`${apiUrl}/api/shop/wallet`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return readResponse(response, "Unable to load your Glow balance", parseWallet);
}

export async function getInventory(accessToken: string): Promise<Inventory> {
  const response = await fetch(`${apiUrl}/api/shop/inventory`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return readResponse(response, "Unable to load your inventory", parseInventory);
}

export async function purchaseItem(
  accessToken: string,
  body: PurchaseItemBody,
): Promise<PurchaseItemResult> {
  const response = await fetch(`${apiUrl}/api/shop/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  return readResponse(response, "Unable to purchase this item", parsePurchaseResult);
}
