import { describe, expect, it } from "vitest";
import { type PreviewMediaSource, resolvePreviewMedia } from "../preview-media.ts";

function source(overrides: Partial<PreviewMediaSource> = {}): PreviewMediaSource {
  return {
    mainVideoUrl: null,
    proDancerVideoUrl: null,
    presentationVideoUrl: null,
    filmYourselfVideoUrl: "https://cdn.test/film-yourself.mp4",
    thumbnailUrl: null,
    proDancerImageUrl: null,
    dancerTipImageUrl: null,
    ...overrides,
  };
}

describe("resolvePreviewMedia", () => {
  it("prefers the main video over every later link in the chain", () => {
    expect(
      resolvePreviewMedia(
        source({
          mainVideoUrl: "https://cdn.test/main.mp4",
          proDancerVideoUrl: "https://cdn.test/pro.mp4",
          presentationVideoUrl: "https://cdn.test/presentation.mp4",
        }),
      ).videoUrl,
    ).toBe("https://cdn.test/main.mp4");
  });

  it("falls through the video chain in order", () => {
    expect(
      resolvePreviewMedia(
        source({
          proDancerVideoUrl: "https://cdn.test/pro.mp4",
          presentationVideoUrl: "https://cdn.test/presentation.mp4",
        }),
      ).videoUrl,
    ).toBe("https://cdn.test/pro.mp4");
    expect(
      resolvePreviewMedia(source({ presentationVideoUrl: "https://cdn.test/presentation.mp4" }))
        .videoUrl,
    ).toBe("https://cdn.test/presentation.mp4");
  });

  it("ends the video chain on the film-yourself reference, which is always present", () => {
    expect(resolvePreviewMedia(source()).videoUrl).toBe("https://cdn.test/film-yourself.mp4");
  });

  it("prefers the thumbnail, then the pro dancer still, then the tip still", () => {
    expect(
      resolvePreviewMedia(
        source({
          thumbnailUrl: "https://cdn.test/thumb.jpg",
          proDancerImageUrl: "https://cdn.test/pro.jpg",
          dancerTipImageUrl: "https://cdn.test/tip.jpg",
        }),
      ).imageUrl,
    ).toBe("https://cdn.test/thumb.jpg");
    expect(
      resolvePreviewMedia(
        source({
          proDancerImageUrl: "https://cdn.test/pro.jpg",
          dancerTipImageUrl: "https://cdn.test/tip.jpg",
        }),
      ).imageUrl,
    ).toBe("https://cdn.test/pro.jpg");
    expect(
      resolvePreviewMedia(source({ dancerTipImageUrl: "https://cdn.test/tip.jpg" })).imageUrl,
    ).toBe("https://cdn.test/tip.jpg");
  });

  it("returns a null image when the move carries no still at all", () => {
    expect(resolvePreviewMedia(source()).imageUrl).toBeNull();
  });
});
