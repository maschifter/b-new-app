import { deleteRecordedDancePost } from "@bnewapp/dance-flow/api";
import { queryAuthAtom, requireAuth } from "@bnewapp/mobile-kit";
import { atomWithMutation } from "jotai-tanstack-query";

/**
 * Removes the temporary cloud upload once its score is terminal. Fail-soft: the
 * server's retention sweep is the backstop, and a user who just danced should not be
 * shown a cleanup error.
 */
export const discardScanUploadMutationAtom = atomWithMutation<void, string, Error>((get) => {
  const auth = get(queryAuthAtom);
  return {
    mutationKey: ["scan-discard-upload", auth?.userId ?? null],
    retry: false,
    mutationFn: async (postId) => {
      await deleteRecordedDancePost(requireAuth(auth).accessToken, postId);
    },
  };
});
