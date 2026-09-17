// Which media a move shows before it is danced. Both apps read the same fields in
// the same order, so the chain lives here rather than being copied into each card.

/**
 * The media fields a preview reads. Typed structurally rather than against
 * `DanceMove` so this package keeps its zero dependencies; `filmYourselfVideoUrl`
 * is non-null because an eligible move always has one, which is what makes the
 * video chain total.
 */
export interface PreviewMediaSource {
  mainVideoUrl: string | null;
  proDancerVideoUrl: string | null;
  presentationVideoUrl: string | null;
  filmYourselfVideoUrl: string;
  thumbnailUrl: string | null;
  proDancerImageUrl: string | null;
  dancerTipImageUrl: string | null;
}

export interface PreviewMedia {
  videoUrl: string;
  /** Null when the move carries no still at all; the caller must survive that. */
  imageUrl: string | null;
}

export function resolvePreviewMedia(move: PreviewMediaSource): PreviewMedia {
  return {
    videoUrl:
      move.mainVideoUrl ??
      move.proDancerVideoUrl ??
      move.presentationVideoUrl ??
      move.filmYourselfVideoUrl,
    imageUrl: move.thumbnailUrl ?? move.proDancerImageUrl ?? move.dancerTipImageUrl,
  };
}
