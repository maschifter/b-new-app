import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  InvalidDanceMediaImageError,
  createDanceMediaService,
  processDanceMediaImage,
} from "../src/modules/admin/dance-media-service.js";
import { httpErrors } from "./helpers/http-errors.js";

function mediaSupabase() {
  const createSignedUploadUrl = vi
    .fn()
    .mockResolvedValue({ data: { token: "ticket-token" }, error: null });
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `https://storage.example/dance-media/${path}` },
  }));
  const upload = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn(),
    storage: {
      from: vi.fn(() => ({ createSignedUploadUrl, getPublicUrl, upload })),
    },
    createSignedUploadUrl,
    upload,
  };
}

describe("dance media service", () => {
  it("creates a fresh signed MP4 ticket and normalizes uppercase extensions", async () => {
    const supabase = mediaSupabase();
    const service = createDanceMediaService(supabase as never, httpErrors as never);

    const ticket = await service.createUploadTicket({
      target: "move",
      field: "main_video_url",
      filename: "dance.MP4",
    });

    expect(ticket).toMatchObject({ contentType: "video/mp4", token: "ticket-token" });
    expect(ticket.path).toMatch(/^moves\/[^/]+\/main-\d+\.mp4$/);
    expect(ticket.publicUrl).toContain(ticket.path);
    expect(supabase.createSignedUploadUrl).toHaveBeenCalledWith(ticket.path);
  });

  it("rejects image fields and unsupported video extensions before minting a ticket", async () => {
    const supabase = mediaSupabase();
    const service = createDanceMediaService(supabase as never, httpErrors as never);

    await expect(
      service.createUploadTicket({
        target: "move",
        field: "thumbnail_url",
        filename: "thumbnail.png",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.createUploadTicket({
        target: "move",
        field: "main_video_url",
        filename: "dance.mov",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.createUploadTicket({
        target: "move",
        field: "main_video_url",
        filename: "dance.webm",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("normalizes an image to the requested WEBP tier", async () => {
    const input = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: "#b02050" },
    })
      .png()
      .toBuffer();

    const output = await processDanceMediaImage(input, 800);
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(400);
  });

  it("rejects non-image bytes", async () => {
    await expect(processDanceMediaImage(Buffer.from("not an image"), 800)).rejects.toBeInstanceOf(
      InvalidDanceMediaImageError,
    );
  });
});
