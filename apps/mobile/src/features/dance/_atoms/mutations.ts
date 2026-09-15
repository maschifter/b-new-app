import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import { atomWithMutation } from "jotai-tanstack-query";
import {
  createDancePost,
  discardUploadingDancePost,
  markDancePostUploaded,
  uploadDanceVideo,
} from "../api";

export interface SubmitDanceRecordingInput {
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
      if (!auth) throw new Error("Not authenticated");
      let postId: string | null = null;
      try {
        const created = await createDancePost(auth.accessToken, {
          danceMoveId,
          videoLength,
          ...(audioOffsetMs === undefined ? {} : { audioOffsetMs }),
        });
        postId = created.postId;
        await uploadDanceVideo(created.upload.signedUrl, path);
        await markDancePostUploaded(auth.accessToken, postId);
        return postId;
      } catch (error) {
        if (postId !== null) {
          try {
            await discardUploadingDancePost(auth.accessToken, postId);
          } catch {
            // A post already queued by a response lost in transit is retained by the server.
          }
        }
        throw error;
      }
    },
  };
});
