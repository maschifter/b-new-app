/**
 * Storage paths of the objects the media worker derives from a recording. The single
 * place that knows the naming scheme, so the worker's uploads and any deletion path
 * cannot drift apart.
 */
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
