import type { ArtHitBox } from "@bnewapp/studio-core";
import sharp, { type Metadata } from "sharp";

const MAX_INPUT_EDGE = 4096;
const MAX_OUTPUT_EDGE = 1024;
const ALPHA_THRESHOLD = 16;
const HITBOX_MARGIN = 2;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export class InvalidCatalogArtError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidCatalogArtError";
  }
}

function alphaBounds(
  pixels: Buffer,
  width: number,
  height: number,
  channels: number,
): ArtHitBox["opaqueBounds"] {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * channels + (channels - 1)] ?? 0;
      if (alpha <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new InvalidCatalogArtError("Image has no visible pixels");
  }

  const x = Math.max(0, minX - HITBOX_MARGIN);
  const y = Math.max(0, minY - HITBOX_MARGIN);
  const right = Math.min(width - 1, maxX + HITBOX_MARGIN);
  const bottom = Math.min(height - 1, maxY + HITBOX_MARGIN);
  return { x, y, width: right - x + 1, height: bottom - y + 1 };
}

export async function processCatalogArt(input: Buffer): Promise<{
  bytes: Buffer;
  hitbox: ArtHitBox;
}> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_EDGE ** 2,
    }).metadata();
  } catch (error) {
    throw new InvalidCatalogArtError("Invalid image file", { cause: error });
  }

  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new InvalidCatalogArtError("Image must be PNG, JPEG, or WEBP");
  }
  if (!metadata.width || !metadata.height) {
    throw new InvalidCatalogArtError("Image dimensions are missing");
  }
  if (metadata.width > MAX_INPUT_EDGE || metadata.height > MAX_INPUT_EDGE) {
    throw new InvalidCatalogArtError("Image dimensions must not exceed 4096px");
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new InvalidCatalogArtError("Animated images are not supported");
  }

  const bytes = await sharp(input)
    .rotate()
    .resize({
      width: MAX_OUTPUT_EDGE,
      height: MAX_OUTPUT_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();

  const { data: pixels, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const opaqueBounds = alphaBounds(pixels, info.width, info.height, info.channels);

  return {
    bytes,
    hitbox: { size: { width: info.width, height: info.height }, opaqueBounds },
  };
}
