import { queryAuthAtom, requireAuth } from "@bnewapp/mobile-kit";
import type { DancePostsPage } from "@bnewapp/types";
import type { InfiniteData } from "@tanstack/react-query";
import { atomWithMutation, queryClientAtom } from "jotai-tanstack-query";
import {
  createDancePost,
  deleteRecordedDancePost,
  discardUploadingDancePost,
  markDancePostUploaded,
  uploadDanceVideo,
} from "../api";
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

interface SubmitDanceRecordingInput {
  danceMoveId: string;
  /** Local `file://` path of the captured clip. */
  path: string;
  videoLength: number;
  /**
   * Music playhead at the first recorded frame. Omitted when the player never started;
   * the server then falls back to the computed timeline offset.
   */
  audioOffsetMs?: number | undefined;
}

/**
 * Create the post, push the clip to its signed upload URL, then queue the scan.
 * Resolves to the post id the score query polls. The three calls are one
 * mutation because a post whose video never lands must not be queued.
 */
export const submitDanceRecordingMutationAtom = atomWithMutation<
  string,
  SubmitDanceRecordingInput,
  Error
>((get) => {
  const auth = get(queryAuthAtom);
  return {
    mutationKey: ["dance-submit-recording", auth?.userId ?? null],
    mutationFn: async ({ danceMoveId, path, videoLength, audioOffsetMs }) => {
      const { accessToken } = requireAuth(auth);
      let postId: string | null = null;
      try {
        const created = await createDancePost(accessToken, {
          danceMoveId,
          videoLength,
          ...(audioOffsetMs === undefined ? {} : { audioOffsetMs }),
        });
        postId = created.postId;
        await uploadDanceVideo(created.upload.signedUrl, path);
        await markDancePostUploaded(accessToken, postId);
        return postId;
      } catch (error) {
        if (postId !== null) {
          try {
            await discardUploadingDancePost(accessToken, postId);
          } catch {
            // A post already queued by a response lost in transit is retained by the server.
          }
        }
        throw error;
      }
    },
  };
});
