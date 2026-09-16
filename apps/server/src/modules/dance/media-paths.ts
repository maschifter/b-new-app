/**
 * Every storage object key a dance post owns. The single place that knows the naming
 * scheme, so `createPost`'s upload, the media worker's uploads and any deletion path
 * cannot drift apart. Keys are owner-scoped and derived from ids alone, so a deletion
 * retry still knows what to remove after the row itself is gone.
 */

/** Object name inside the owner's folder, which is what Storage `list(search)` matches. */
export function recordingObjectName(postId: string): string {
  return `${postId}.mp4`;
}

/** The recording as uploaded by the device, before the worker derives anything from it. */
export function recordingObjectPath(ownerId: string, postId: string): string {
  return `${ownerId}/${recordingObjectName(postId)}`;
}

/** What the media worker produces from a recording: the music merge and its poster frame. */
export function derivedObjectPaths(
  ownerId: string,
  postId: string,
): {
  mergedVideo: string;
  thumbnail: string;
} {
  return {
    mergedVideo: `${ownerId}/${postId}-merged.mp4`,
    thumbnail: `${ownerId}/${postId}.jpg`,
  };
}
