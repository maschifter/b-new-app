/**
 * The captured clip and its round trip through router params. Both apps hand a clip
 * from their record route to their result route as a URL, so the encode and the decode
 * are one pair here rather than a copy in each app.
 *
 * Nothing here imports React Native or a native module, so a route can validate its
 * params without pulling in the camera stack.
 */

export interface RecordedDanceClip {
  /** Local `file://` path of the captured clip. */
  path: string;
  duration: number;
  /**
   * Music playhead at the first recorded frame, in milliseconds. Undefined — never 0 —
   * when the player never started, because 0 is a legitimate offset and would silently
   * mux the track from its very start instead of reaching the server's fallback.
   */
  audioOffsetMs?: number | undefined;
}

/** A clip serialized for `router.replace`. A URL carries strings and nothing else. */
export interface DanceClipParams {
  clipPath: string;
  clipDuration: string;
  clipAudioOffsetMs?: string;
}

/** What `useLocalSearchParams` yields, before any of it has been validated. */
export interface UnparsedDanceClipParams {
  clipPath?: string | undefined;
  clipDuration?: string | undefined;
  clipAudioOffsetMs?: string | undefined;
}

export function toDanceClipParams({
  path,
  duration,
  audioOffsetMs,
}: RecordedDanceClip): DanceClipParams {
  return {
    clipPath: path,
    clipDuration: String(duration),
    // Omitted rather than stringified when absent, so the parse can tell "never
    // measured" from a measured 0.
    ...(audioOffsetMs === undefined ? {} : { clipAudioOffsetMs: String(audioOffsetMs) }),
  };
}

function isLocalVideoPath(value: string | undefined): value is string {
  return typeof value === "string" && value.startsWith("file://");
}

/**
 * A measured 0 is a real offset, so this cannot use a falsy check: only a missing or
 * unparseable param counts as absent, and the server then falls back to the computed
 * timeline offset.
 */
function parseAudioOffsetMs(value: string | undefined): number | undefined {
  // The empty check is not redundant: `Number("")` is 0, which would turn a dropped
  // param into a measured "start of the track".
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Rebuilds the clip a record route serialized. `null` for params no record route could
 * have produced, which is the caller's signal to redirect out of the flow.
 */
export function parseDanceClipParams({
  clipPath,
  clipDuration,
  clipAudioOffsetMs,
}: UnparsedDanceClipParams): RecordedDanceClip | null {
  if (!isLocalVideoPath(clipPath)) return null;
  const duration = Number(clipDuration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return {
    path: clipPath,
    duration,
    audioOffsetMs: parseAudioOffsetMs(clipAudioOffsetMs),
  };
}
