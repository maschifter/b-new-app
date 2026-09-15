import { describe, expect, it } from "vitest";
import { AUDIO_OFFSET_CEILING_MS } from "../src/modules/dance/config.js";
import {
  buildMergeArgs,
  buildPosterArgs,
  clampAudioOffsetSeconds,
  posterSeekSeconds,
} from "../src/modules/dance/media-processor.js";

const merge = {
  videoPath: "/tmp/job/recording.mp4",
  musicPath: "/tmp/job/music",
  offsetSeconds: 12.5,
  outputPath: "/tmp/job/merged.mp4",
};

function indexOfArg(args: string[], value: string): number {
  return args.indexOf(value);
}

describe("dance media argument builders", () => {
  it("seeks the music input, copies the video stream, and encodes only the audio", () => {
    const args = buildMergeArgs(merge);

    // `-ss` is an input seek and must sit between the two inputs to apply to the music.
    expect(indexOfArg(args, "-ss")).toBeGreaterThan(indexOfArg(args, merge.videoPath));
    expect(indexOfArg(args, "-ss")).toBeLessThan(indexOfArg(args, merge.musicPath));
    expect(args[indexOfArg(args, "-ss") + 1]).toBe("12.500");
    expect(args).toEqual(expect.arrayContaining(["-c:v", "copy", "-c:a", "aac", "-b:a", "128k"]));
    expect(args.at(-1)).toBe(merge.outputPath);
  });

  it("pads the seeked audio so -shortest cuts the music, never the dance", () => {
    expect(buildMergeArgs(merge)).toEqual(expect.arrayContaining(["-af", "apad", "-shortest"]));
  });

  it("places the -shortest correction flags after the maps and before the output path", () => {
    const args = buildMergeArgs(merge);
    const lastMap = args.lastIndexOf("-map");
    const output = args.length - 1;

    for (const flag of ["-fflags", "-max_interleave_delta"]) {
      expect(indexOfArg(args, flag)).toBeGreaterThan(lastMap);
      expect(indexOfArg(args, flag)).toBeLessThan(output);
    }
    expect(args[indexOfArg(args, "-fflags") + 1]).toBe("+shortest");
    expect(args[indexOfArg(args, "-max_interleave_delta") + 1]).toBe("100M");
    expect(args).toEqual(expect.arrayContaining(["-movflags", "+faststart"]));
  });

  it("drops the poster seek entirely when there is no frame to seek to", () => {
    const args = buildPosterArgs({
      videoPath: merge.videoPath,
      seekSeconds: 0,
      outputPath: "/tmp/job/poster.jpg",
    });

    expect(args).not.toContain("-ss");
    expect(args).toEqual(expect.arrayContaining(["-frames:v", "1"]));
  });

  it("seeks the poster before the input so the decode stops at one frame", () => {
    const args = buildPosterArgs({
      videoPath: merge.videoPath,
      seekSeconds: 0.75,
      outputPath: "/tmp/job/poster.jpg",
    });

    expect(indexOfArg(args, "-ss")).toBeLessThan(indexOfArg(args, "-i"));
    expect(args[indexOfArg(args, "-ss") + 1]).toBe("0.750");
  });
});

describe("posterSeekSeconds", () => {
  it("takes the first frame of a sub-second clip rather than seeking past its end", () => {
    expect(posterSeekSeconds(0.1)).toBe(0);
    expect(posterSeekSeconds(0.9)).toBe(0);
  });

  it("halves a short clip and caps a long one at one second", () => {
    expect(posterSeekSeconds(1.4)).toBe(0.7);
    expect(posterSeekSeconds(60)).toBe(1);
  });

  it("falls back to the first frame when the duration could not be probed", () => {
    expect(posterSeekSeconds(null)).toBe(0);
    expect(posterSeekSeconds(Number.NaN)).toBe(0);
  });
});

describe("clampAudioOffsetSeconds", () => {
  it("keeps an offset that fits inside the track", () => {
    expect(clampAudioOffsetSeconds(12_500, 180)).toBe(12.5);
  });

  it("collapses an offset beyond the track to the last usable second, never past EOF", () => {
    expect(clampAudioOffsetSeconds(60_000, 20)).toBe(19);
    expect(clampAudioOffsetSeconds(60_000, 0.5)).toBe(0);
  });

  it("clamps to the request-edge ceiling before the track is consulted", () => {
    expect(clampAudioOffsetSeconds(AUDIO_OFFSET_CEILING_MS * 2, 100_000)).toBe(
      AUDIO_OFFSET_CEILING_MS / 1000,
    );
  });

  it("starts the track from the beginning when its duration is unknown", () => {
    expect(clampAudioOffsetSeconds(12_500, null)).toBe(0);
  });
});
