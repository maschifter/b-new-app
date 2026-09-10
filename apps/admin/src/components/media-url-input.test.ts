import { describe, expect, it } from "vitest";
import { parseNullableUrl, previewKind } from "./media-url-input";

describe("media URL helpers", () => {
  it("shows only the requested preview for valid URLs", () => {
    expect(previewKind("https://cdn.example.com/thumb.webp", "image")).toBe("image");
    expect(previewKind("https://cdn.example.com/track.mp3", "audio")).toBe("audio");
    expect(previewKind("https://cdn.example.com/video.mp4", "video")).toBe("video");
    expect(previewKind("https://cdn.example.com/video.mp4", "link")).toBe("link");
  });

  it("hides previews for empty or invalid values", () => {
    expect(previewKind("", "image")).toBe("none");
    expect(previewKind("not a URL", "audio")).toBe("none");
  });

  it("maps cleared inputs to null", () => {
    expect(parseNullableUrl("")).toBeNull();
    expect(parseNullableUrl(undefined)).toBeNull();
    expect(parseNullableUrl("https://example.com/file")).toBe("https://example.com/file");
  });
});
