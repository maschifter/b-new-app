import { describe, expect, it } from "vitest";
import {
  MAX_VIDEO_BITRATE,
  acceptForMediaKind,
  validateMediaFile,
  validateVideoBitrate,
} from "./media-upload-guard";

const MEBIBYTE = 1024 * 1024;

describe("dance media upload guard", () => {
  it("uses bits rather than bytes when checking a video bitrate", () => {
    expect(validateVideoBitrate(60 * MEBIBYTE, 60)).toBeUndefined();
    expect(validateVideoBitrate(60 * MEBIBYTE + 1, 60)).toContain("exceeds 8 Mbps");
    expect(MAX_VIDEO_BITRATE).toBe(8 * MEBIBYTE);
  });

  it("rejects unreadable video metadata", () => {
    expect(validateVideoBitrate(100, undefined)).toContain("could not be read");
    expect(validateVideoBitrate(100, 0)).toContain("could not be read");
  });

  it("enforces per-kind extension and size limits", () => {
    expect(validateMediaFile({ name: "clip.MP4", size: 45 * MEBIBYTE }, "video")).toBeUndefined();
    expect(validateMediaFile({ name: "clip.mp4", size: 45 * MEBIBYTE + 1 }, "video")).toContain(
      "45 MB",
    );
    expect(validateMediaFile({ name: "clip.mov", size: 1 }, "video")).toContain("supported");
    expect(validateMediaFile({ name: "track.mp3", size: 20 * MEBIBYTE + 1 }, "audio")).toContain(
      "20 MB",
    );
    expect(validateMediaFile({ name: "image.png", size: 10 * MEBIBYTE + 1 }, "image")).toContain(
      "10 MB",
    );
  });

  it("exposes the server-compatible video picker accept list", () => {
    expect(acceptForMediaKind("video")).toBe(".mp4,video/mp4");
  });
});
