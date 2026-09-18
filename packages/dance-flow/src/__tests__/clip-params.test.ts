import { type RecordedDanceClip, parseDanceClipParams, toDanceClipParams } from "../clip-params";

const CLIP_PATH = "file:///tmp/dance-attempt.mp4";

/**
 * The round trip is the contract: whatever a record route serializes, the result route
 * must rebuild. A falsy check anywhere along the way would turn a measured 0 into
 * "never measured" and silently move the music to the top of the track.
 */
describe("the record to result round trip", () => {
  it.each<[string, RecordedDanceClip]>([
    ["a measured offset", { path: CLIP_PATH, duration: 12.4, audioOffsetMs: 12_346 }],
    ["a measured zero", { path: CLIP_PATH, duration: 12.4, audioOffsetMs: 0 }],
    ["no offset at all", { path: CLIP_PATH, duration: 12.4 }],
  ])("preserves %s", (_label, clip) => {
    expect(parseDanceClipParams(toDanceClipParams(clip))).toEqual({
      audioOffsetMs: undefined,
      ...clip,
    });
  });

  it("omits the offset param rather than stringifying undefined", () => {
    expect(toDanceClipParams({ path: CLIP_PATH, duration: 12.4 })).not.toHaveProperty(
      "clipAudioOffsetMs",
    );
  });

  it("keeps a measured zero as a param", () => {
    expect(toDanceClipParams({ path: CLIP_PATH, duration: 12.4, audioOffsetMs: 0 })).toEqual({
      clipPath: CLIP_PATH,
      clipDuration: "12.4",
      clipAudioOffsetMs: "0",
    });
  });
});

describe("parsing params the flow did not produce", () => {
  it.each(["", "not-a-number", "-1"])(
    "treats an unusable offset as absent rather than as a seek: %p",
    (clipAudioOffsetMs) => {
      const clip = parseDanceClipParams({
        clipPath: CLIP_PATH,
        clipDuration: "12.4",
        clipAudioOffsetMs,
      });

      expect(clip?.audioOffsetMs).toBeUndefined();
    },
  );

  it.each([
    ["a remote url", { clipPath: "https://cdn.test/attempt.mp4", clipDuration: "12.4" }],
    ["a missing path", { clipDuration: "12.4" }],
    ["a missing duration", { clipPath: CLIP_PATH }],
    ["an unparseable duration", { clipPath: CLIP_PATH, clipDuration: "soon" }],
    ["an empty duration", { clipPath: CLIP_PATH, clipDuration: "" }],
    ["a zero duration", { clipPath: CLIP_PATH, clipDuration: "0" }],
    ["a negative duration", { clipPath: CLIP_PATH, clipDuration: "-4" }],
  ])("rejects %s", (_label, params) => {
    expect(parseDanceClipParams(params)).toBeNull();
  });
});
