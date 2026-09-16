import { shouldFinishScorePolling } from "@bnewapp/dance-core";
import { readQueryAuth, requireAuth } from "@bnewapp/mobile-kit";
import type { DanceMove, ScanStatus } from "@bnewapp/types";
import { atomFamily } from "jotai-family";
import { atomWithQuery, atomWithSuspenseQuery } from "jotai-tanstack-query";
import { getDanceMove, getDanceScoreStatus } from "../api";
import { scorePollIntervalMs } from "../score-polling";
import { activeDanceScanAtom } from "./ui";

export const danceMoveDetailAtomFamily = atomFamily((moveId: string) =>
  atomWithSuspenseQuery<DanceMove>((get) => {
    const auth = readQueryAuth(get);
    return {
      queryKey: ["dance-move", auth?.userId ?? null, moveId],
      queryFn: async () => getDanceMove(requireAuth(auth).accessToken, moveId),
    };
  }),
);

/**
 * Non-suspense twin of `danceMoveDetailAtomFamily`, sharing its query key so the Record
 * screen's cached move is reused rather than refetched. The Result screen reads the move
 * only for its music: suspending there would hold the upload behind a fetch the dance
 * does not need, and a failed fetch must cost the music, not the screen.
 */
export const optionalDanceMoveAtomFamily = atomFamily((moveId: string) =>
  atomWithQuery<DanceMove>((get) => {
    const auth = readQueryAuth(get, { errorBoundaryReset: false });
    return {
      queryKey: ["dance-move", auth?.userId ?? null, moveId],
      enabled: auth !== null,
      queryFn: async () => getDanceMove(requireAuth(auth).accessToken, moveId),
    };
  }),
);

export function danceScoreQueryKey(userId: string | null, postId: string | null) {
  return ["dance-score", userId, postId] as const;
}

/**
 * Polls one queued scan until it reaches a terminal state. The server guarantees
 * a fallback result, so this intentionally has no client-side deadline.
 */
export const danceScoreAtom = atomWithQuery<ScanStatus, Error>((get) => {
  const auth = readQueryAuth(get, { errorBoundaryReset: false });
  const scan = get(activeDanceScanAtom);
  return {
    queryKey: danceScoreQueryKey(auth?.userId ?? null, scan?.postId ?? null),
    enabled: auth !== null && scan !== null,
    gcTime: 0,
    queryFn: async () => {
      if (!scan) throw new Error("No active dance scan");
      return getDanceScoreStatus(requireAuth(auth).accessToken, scan.postId);
    },
    retry: true,
    retryDelay: (failureCount) => scorePollIntervalMs(failureCount + 1),
    refetchInterval: (query) => {
      const status = query.state.data;
      return status && shouldFinishScorePolling(status)
        ? false
        : scorePollIntervalMs(query.state.dataUpdateCount);
    },
  };
});
