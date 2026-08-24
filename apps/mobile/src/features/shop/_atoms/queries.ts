import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import { queryErrorResetVersionAtom } from "@/lib/react-query/query-error-reset";
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
  const auth = get(queryAuthAtom);
  get(queryErrorResetVersionAtom);
  return {
    queryKey: walletQueryKey(auth?.userId ?? null),
    enabled: auth !== null,
    throwOnError: true,
    queryFn: async () => {
      if (!auth) throw new Error("Not authenticated");
      return getWallet(auth.accessToken);
    },
  };
});

export const inventoryAtom = atomWithQuery<Inventory>((get) => {
  const auth = get(queryAuthAtom);
  get(queryErrorResetVersionAtom);
  return {
    queryKey: inventoryQueryKey(auth?.userId ?? null),
    enabled: auth !== null,
    throwOnError: true,
    queryFn: async () => {
      if (!auth) throw new Error("Not authenticated");
      return getInventory(auth.accessToken);
    },
  };
});
