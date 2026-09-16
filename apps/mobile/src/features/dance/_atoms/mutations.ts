import { deleteRecordedDancePost } from "@bnewapp/dance-flow/api";
import { queryAuthAtom, requireAuth } from "@bnewapp/mobile-kit";
import type { DancePostsPage } from "@bnewapp/types";
import type { InfiniteData } from "@tanstack/react-query";
import { atomWithMutation, queryClientAtom } from "jotai-tanstack-query";
import { dancePostDetailQueryKey, dancePostsQueryKey } from "./queries";

export const deleteDancePostMutationAtom = atomWithMutation<void, string, Error>((get) => {
  const auth = get(queryAuthAtom);
  const queryClient = get(queryClientAtom);
  return {
    mutationKey: ["dance-delete-post", auth?.userId ?? null],
    mutationFn: async (postId) => deleteRecordedDancePost(requireAuth(auth).accessToken, postId),
    onSuccess: async (_data, postId) => {
      const userId = auth?.userId ?? null;
      const queryKey = dancePostsQueryKey(userId);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<InfiniteData<DancePostsPage>>(queryKey, (previous) =>
        previous
          ? {
              ...previous,
              pages: previous.pages.map((page) => ({
                ...page,
                items: page.items.filter((post) => post.id !== postId),
              })),
            }
          : previous,
      );
      queryClient.removeQueries({ queryKey: dancePostDetailQueryKey(userId, postId) });
      // No invalidation: the cached pages already reflect the deletion, and refetching
      // would replace every signed media URL and recreate grid players during the back
      // transition.
    },
  };
});
