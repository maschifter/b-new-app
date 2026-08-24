import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("sharp runtime", () => {
  it("loads the platform binary and encodes WEBP", async () => {
    const result = await sharp({
      create: {
        width: 2,
        height: 3,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .webp()
      .toBuffer({ resolveWithObject: true });

    expect(result.info).toMatchObject({ format: "webp", width: 2, height: 3 });
    expect(result.data.byteLength).toBeGreaterThan(0);
  });
});
