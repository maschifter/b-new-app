import { queryAuthAtom, requireAuth } from "@bnewapp/mobile-kit";
import { atomWithMutation } from "jotai-tanstack-query";
import {
  createDancePost,
  discardUploadingDancePost,
  markDancePostUploaded,
  uploadDanceVideo,
} from "../api";

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
 *
 * It has no `onSuccess`, which is the only reason it separates from a host app's
 * post history: the moment the flow has to refresh that history, the refresh must
 * arrive as a callback the host app supplies, not as an import into this package.
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
