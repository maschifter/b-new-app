import { readQueryAuth, requireAuth } from "@bnewapp/mobile-kit";
import type { Inventory, Wallet } from "@bnewapp/types";
import { atomWithQuery } from "jotai-tanstack-query";
import { getInventory, getWallet } from "../api";

export function walletQueryKey(userId: string | null) {
  return ["shop-wallet", userId] as const;
}

export function inventoryQueryKey(userId: string | null) {
  return ["shop-inventory", userId] as const;
}

export const walletAtom = atomWithQuery<Wallet>((get) => {
  const auth = readQueryAuth(get);
  return {
    queryKey: walletQueryKey(auth?.userId ?? null),
    enabled: auth !== null,
    throwOnError: true,
    queryFn: async () => getWallet(requireAuth(auth).accessToken),
  };
});

export const inventoryAtom = atomWithQuery<Inventory>((get) => {
  const auth = readQueryAuth(get);
  return {
    queryKey: inventoryQueryKey(auth?.userId ?? null),
    enabled: auth !== null,
    throwOnError: true,
    queryFn: async () => getInventory(requireAuth(auth).accessToken),
  };
});
