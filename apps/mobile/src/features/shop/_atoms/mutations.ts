import { queryAuthAtom, requireAuth } from "@bnewapp/mobile-kit";
import type { PurchaseItemResult } from "@bnewapp/types";
import { atomWithMutation, queryClientAtom } from "jotai-tanstack-query";
import { purchaseItem } from "../api";
import { inventoryQueryKey, walletQueryKey } from "./queries";

export const purchaseMutationAtom = atomWithMutation<PurchaseItemResult, string, Error>((get) => {
  const auth = get(queryAuthAtom);
  const queryClient = get(queryClientAtom);
  return {
    mutationKey: ["shop-purchase", auth?.userId ?? null],
    mutationFn: async (itemId) => purchaseItem(requireAuth(auth).accessToken, { itemId }),
    onSuccess: async () => {
      if (!auth) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: walletQueryKey(auth.userId) }),
        queryClient.invalidateQueries({ queryKey: inventoryQueryKey(auth.userId) }),
      ]);
    },
  };
});
