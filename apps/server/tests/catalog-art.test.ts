import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InvalidCatalogArtError, processCatalogArt } from "../src/modules/catalog/art.js";

async function opaquePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 220, g: 40, b: 80 } },
  })
    .png()
    .toBuffer();
}

async function transparentRectanglePng(): Promise<Buffer> {
  const width = 100;
  const height = 80;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 10; y < 50; y += 1) {
    for (let x = 20; x < 70; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 220;
      pixels[offset + 1] = 40;
      pixels[offset + 2] = 80;
      pixels[offset + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe("catalog art processing", () => {
  it("encodes opaque input as WEBP with a full-frame hit-box", async () => {
    const result = await processCatalogArt(await opaquePng(200, 100));

    expect((await sharp(result.bytes).metadata()).format).toBe("webp");
    expect(result.hitbox).toEqual({
      size: { width: 200, height: 100 },
      opaqueBounds: { x: 0, y: 0, width: 200, height: 100 },
    });
  });

  it("computes alpha bounds from processed pixels without cropping the image", async () => {
    const result = await processCatalogArt(await transparentRectanglePng());

    expect(result.hitbox.size).toEqual({ width: 100, height: 80 });
    expect(result.hitbox.opaqueBounds).toEqual({ x: 18, y: 8, width: 54, height: 44 });
  });

  it("caps the long edge at 1024px without changing aspect ratio", async () => {
    const result = await processCatalogArt(await opaquePng(2048, 1024));

    expect(result.hitbox).toEqual({
      size: { width: 1024, height: 512 },
      opaqueBounds: { x: 0, y: 0, width: 1024, height: 512 },
    });
  });

  it("rejects invalid and fully transparent files", async () => {
    const transparent = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    await expect(processCatalogArt(Buffer.from("not-an-image"))).rejects.toBeInstanceOf(
      InvalidCatalogArtError,
    );
    await expect(processCatalogArt(transparent)).rejects.toThrow("Image has no visible pixels");
  });
});
