import { describe, expect, it, vi } from "vitest";
import { createDanceService } from "../src/modules/dance/service.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const MOVE_ID = "22222222-2222-4222-8222-222222222222";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const MUSIC_ID = "44444444-4444-4444-8444-444444444444";
const CREATED_AT = "2026-09-11T00:00:00.000Z";

const httpErrors = {
  conflict: (message: string) => Object.assign(new Error(message), { statusCode: 409 }),
  internalServerError: (message: string) => Object.assign(new Error(message), { statusCode: 500 }),
  notFound: (message: string) => Object.assign(new Error(message), { statusCode: 404 }),
};

function queryBuilder(result: { count?: number; data?: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () => query;
  for (const method of [
    "delete",
    "eq",
    "insert",
    "limit",
    "neq",
    "not",
    "or",
    "order",
    "select",
    "update",
    "upsert",
  ]) {
    query[method] = vi.fn(chain);
  }
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  // biome-ignore lint/suspicious/noThenProperty: mirrors Supabase's awaitable query builder
  query.then = vi.fn((onfulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onfulfilled),
  );
  return query;
}

function postRow(status = "uploading") {
  return {
    id: POST_ID,
    owner_id: OWNER_ID,
    dance_move_id: MOVE_ID,
    music_id: null,
    video_path: `${OWNER_ID}/${POST_ID}.mp4`,
    merged_video_path: null,
    thumbnail_path: null,
    blurhash: null,
    audio_offset_ms: null,
    status,
    score: null,
    video_length_s: 12,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  };
}

/** Mirrors Supabase's per-path signing response: one entry per requested path. */
function signedUrlsFor(...paths: string[]) {
  return vi.fn().mockResolvedValue({
    data: paths.map((path) => ({ error: null, path, signedUrl: `https://signed.example/${path}` })),
    error: null,
  });
}

const postMove = {
  title: "Electric Slide",
  description: "Start with the groove.",
};
const postMusic = { title: "The Track", artist: "The Artist" };

describe("dance post service", () => {
  it("returns an owned recorded post with metadata even when its move is no longer published", async () => {
    const post = queryBuilder({ data: { ...postRow("scored"), music_id: MUSIC_ID }, error: null });
    const move = queryBuilder({ data: postMove, error: null });
    const music = queryBuilder({ data: postMusic, error: null });
    const createSignedUrls = signedUrlsFor(`${OWNER_ID}/${POST_ID}.mp4`);
    const service = createDanceService(
      {
        from: vi
          .fn()
          .mockReturnValueOnce(post)
          .mockReturnValueOnce(move)
          .mockReturnValueOnce(music),
        storage: { from: vi.fn(() => ({ createSignedUrls })) },
      } as never,
      httpErrors as never,
    );

    await expect(service.getPost(OWNER_ID, POST_ID)).resolves.toMatchObject({
      id: POST_ID,
      videoUrl: `https://signed.example/${OWNER_ID}/${POST_ID}.mp4`,
      mergedVideoUrl: null,
      thumbnailUrl: null,
      thumbnailPath: null,
      blurhash: null,
      danceMove: { title: "Electric Slide", music: { title: "The Track" } },
    });
    expect(post.eq).toHaveBeenCalledWith("id", POST_ID);
    expect(post.eq).toHaveBeenCalledWith("owner_id", OWNER_ID);
    expect(post.neq).toHaveBeenCalledWith("status", "uploading");
    expect(move.eq).toHaveBeenCalledWith("id", MOVE_ID);
    expect(music.eq).toHaveBeenCalledWith("id", MUSIC_ID);
  });

  it("does not expose a recorded post that is absent or owned by another user", async () => {
    const post = queryBuilder({ data: null, error: null });
    const service = createDanceService(
      { from: vi.fn(() => post), storage: { from: vi.fn() } } as never,
      httpErrors as never,
    );

    await expect(service.getPost(OWNER_ID, POST_ID)).rejects.toMatchObject({ statusCode: 404 });
    expect(post.eq).toHaveBeenCalledWith("id", POST_ID);
    expect(post.eq).toHaveBeenCalledWith("owner_id", OWNER_ID);
  });

  it("returns only the owner's posts with short-lived signed video URLs", async () => {
    const posts = queryBuilder({ data: [postRow("scored")], error: null });
    const createSignedUrls = signedUrlsFor(`${OWNER_ID}/${POST_ID}.mp4`);
    const service = createDanceService(
      { from: vi.fn(() => posts), storage: { from: vi.fn(() => ({ createSignedUrls })) } } as never,
      httpErrors as never,
    );

    await expect(service.listPosts(OWNER_ID, { limit: 18 })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          id: POST_ID,
          videoUrl: `https://signed.example/${OWNER_ID}/${POST_ID}.mp4`,
        }),
      ],
      nextCursor: null,
    });
    expect(posts.eq).toHaveBeenCalledWith("owner_id", OWNER_ID);
    expect(posts.neq).toHaveBeenCalledWith("status", "uploading");
    expect(posts.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(createSignedUrls).toHaveBeenCalledWith([`${OWNER_ID}/${POST_ID}.mp4`], 3600);
  });

  it("uses the final returned post as the descending keyset cursor", async () => {
    const nextPostId = "44444444-4444-4444-8444-444444444444";
    const posts = queryBuilder({
      data: [postRow("scored"), { ...postRow("scored"), id: nextPostId }],
      error: null,
    });
    const createSignedUrls = signedUrlsFor(`${OWNER_ID}/${POST_ID}.mp4`);
    const service = createDanceService(
      { from: vi.fn(() => posts), storage: { from: vi.fn(() => ({ createSignedUrls })) } } as never,
      httpErrors as never,
    );

    await expect(
      service.listPosts(OWNER_ID, {
        limit: 1,
        cursor: { createdAt: CREATED_AT, id: POST_ID },
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: POST_ID })],
      nextCursor: { createdAt: CREATED_AT, id: POST_ID },
    });
    expect(posts.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(posts.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(posts.limit).toHaveBeenCalledWith(2);
    expect(posts.or).toHaveBeenCalledWith(
      `created_at.lt.${CREATED_AT},and(created_at.eq.${CREATED_AT},id.lt.${POST_ID})`,
    );
    expect(createSignedUrls).toHaveBeenCalledOnce();
  });

  it("creates an owned post and signed upload target for an eligible move", async () => {
    const move = queryBuilder({ data: { id: MOVE_ID, music_id: null }, error: null });
    const insert = queryBuilder({ error: null });
    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.example/upload" },
      error: null,
    });
    const from = vi.fn().mockReturnValueOnce(move).mockReturnValueOnce(insert);
    const service = createDanceService(
      { from, storage: { from: vi.fn(() => ({ createSignedUploadUrl })) } } as never,
      httpErrors as never,
    );

    const result = await service.createPost(OWNER_ID, { danceMoveId: MOVE_ID, videoLength: 12 });

    expect(result.upload.signedUrl).toBe("https://storage.example/upload");
    expect(result.upload.path).toMatch(new RegExp(`^${OWNER_ID}/[0-9a-f-]+\\.mp4$`));
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: OWNER_ID, dance_move_id: MOVE_ID, video_length_s: 12 }),
    );
  });

  it("persists the device-measured audio offset, including a literal zero", async () => {
    for (const [audioOffsetMs, expected] of [
      [undefined, null],
      [0, 0],
      [4200, 4200],
    ] as const) {
      const move = queryBuilder({ data: { id: MOVE_ID, music_id: null }, error: null });
      const insert = queryBuilder({ error: null });
      const service = createDanceService(
        {
          from: vi.fn().mockReturnValueOnce(move).mockReturnValueOnce(insert),
          storage: {
            from: vi.fn(() => ({
              createSignedUploadUrl: vi
                .fn()
                .mockResolvedValue({ data: { signedUrl: "https://up" }, error: null }),
            })),
          },
        } as never,
        httpErrors as never,
      );

      await service.createPost(OWNER_ID, {
        danceMoveId: MOVE_ID,
        videoLength: 12,
        ...(audioOffsetMs === undefined ? {} : { audioOffsetMs }),
      });

      expect(insert.insert).toHaveBeenCalledWith(
        expect.objectContaining({ audio_offset_ms: expected }),
      );
    }
  });

  it("signs a page in one call and zips the URLs back by path, not by index", async () => {
    const secondPostId = "55555555-5555-4555-8555-555555555555";
    const first = {
      ...postRow("scored"),
      merged_video_path: `${OWNER_ID}/${POST_ID}-merged.mp4`,
      thumbnail_path: `${OWNER_ID}/${POST_ID}.jpg`,
      blurhash: "LEHV6nWB2yk8",
    };
    const second = {
      ...postRow("scored"),
      id: secondPostId,
      video_path: `${OWNER_ID}/${secondPostId}.mp4`,
    };
    const posts = queryBuilder({ data: [first, second], error: null });
    // Deliberately out of input order: index-based zipping would mis-attribute these.
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { error: null, path: second.video_path, signedUrl: "https://signed.example/second" },
        { error: null, path: first.thumbnail_path, signedUrl: "https://signed.example/thumb" },
        { error: null, path: first.video_path, signedUrl: "https://signed.example/first" },
        { error: null, path: first.merged_video_path, signedUrl: "https://signed.example/merged" },
      ],
      error: null,
    });
    const service = createDanceService(
      { from: vi.fn(() => posts), storage: { from: vi.fn(() => ({ createSignedUrls })) } } as never,
      httpErrors as never,
    );

    const page = await service.listPosts(OWNER_ID, { limit: 18 });

    expect(createSignedUrls).toHaveBeenCalledOnce();
    expect(createSignedUrls).toHaveBeenCalledWith(
      [first.video_path, first.merged_video_path, first.thumbnail_path, second.video_path],
      3600,
    );
    expect(page.items).toMatchObject([
      {
        id: POST_ID,
        videoUrl: "https://signed.example/first",
        mergedVideoUrl: "https://signed.example/merged",
        thumbnailUrl: "https://signed.example/thumb",
        thumbnailPath: first.thumbnail_path,
        blurhash: "LEHV6nWB2yk8",
      },
      {
        id: secondPostId,
        videoUrl: "https://signed.example/second",
        mergedVideoUrl: null,
        thumbnailUrl: null,
      },
    ]);
  });

  it("degrades a derived object to null when its own signing entry fails", async () => {
    const row = {
      ...postRow("scored"),
      merged_video_path: `${OWNER_ID}/${POST_ID}-merged.mp4`,
      thumbnail_path: `${OWNER_ID}/${POST_ID}.jpg`,
    };
    const posts = queryBuilder({ data: [row], error: null });
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { error: null, path: row.video_path, signedUrl: "https://signed.example/video" },
        // A failed entry comes back without a path, so it cannot be attributed to a row.
        { error: "Object not found", path: null, signedUrl: "" },
        { error: null, path: row.thumbnail_path, signedUrl: "https://signed.example/thumb" },
      ],
      error: null,
    });
    const service = createDanceService(
      { from: vi.fn(() => posts), storage: { from: vi.fn(() => ({ createSignedUrls })) } } as never,
      httpErrors as never,
    );

    await expect(service.listPosts(OWNER_ID, { limit: 18 })).resolves.toMatchObject({
      items: [
        {
          videoUrl: "https://signed.example/video",
          mergedVideoUrl: null,
          thumbnailUrl: "https://signed.example/thumb",
        },
      ],
    });
  });

  it("fails the page when the original recording cannot be signed", async () => {
    const posts = queryBuilder({ data: [postRow("scored")], error: null });
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [{ error: "Object not found", path: null, signedUrl: "" }],
      error: null,
    });
    const service = createDanceService(
      { from: vi.fn(() => posts), storage: { from: vi.fn(() => ({ createSignedUrls })) } } as never,
      httpErrors as never,
    );

    await expect(service.listPosts(OWNER_ID, { limit: 18 })).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it("removes a newly-created post when minting its upload URL fails", async () => {
    const move = queryBuilder({ data: { id: MOVE_ID, music_id: null }, error: null });
    const insert = queryBuilder({ error: null });
    const cleanup = queryBuilder({ error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(move)
      .mockReturnValueOnce(insert)
      .mockReturnValueOnce(cleanup);
    const service = createDanceService(
      {
        from,
        storage: {
          from: vi.fn(() => ({
            createSignedUploadUrl: vi.fn().mockResolvedValue({ data: null, error: {} }),
          })),
        },
      } as never,
      httpErrors as never,
    );

    await expect(
      service.createPost(OWNER_ID, { danceMoveId: MOVE_ID, videoLength: 12 }),
    ).rejects.toMatchObject({
      statusCode: 500,
    });
    expect(cleanup.delete).toHaveBeenCalledOnce();
    expect(cleanup.eq).toHaveBeenCalledWith("owner_id", OWNER_ID);
  });

  it("queues a scan only after the owned video object is present", async () => {
    const existing = queryBuilder({ data: postRow(), error: null });
    const uploaded = queryBuilder({ data: postRow("uploaded"), error: null });
    const queued = queryBuilder({ error: null });
    const list = vi.fn().mockResolvedValue({ data: [{ name: `${POST_ID}.mp4` }], error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(existing)
      .mockReturnValueOnce(uploaded)
      .mockReturnValueOnce(queued);
    const service = createDanceService(
      { from, storage: { from: vi.fn(() => ({ list })) } } as never,
      httpErrors as never,
    );

    await expect(service.markUploaded(OWNER_ID, POST_ID)).resolves.toMatchObject({
      status: "uploaded",
    });
    expect(list).toHaveBeenCalledWith(OWNER_ID, { limit: 1, search: `${POST_ID}.mp4` });
    expect(queued.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: OWNER_ID, post_id: POST_ID, status: "pending" }),
      { ignoreDuplicates: true, onConflict: "post_id" },
    );
  });

  it("does not transition or queue a post whose video object is absent", async () => {
    const existing = queryBuilder({ data: postRow(), error: null });
    const list = vi.fn().mockResolvedValue({ data: [], error: null });
    const from = vi.fn().mockReturnValueOnce(existing);
    const service = createDanceService(
      { from, storage: { from: vi.fn(() => ({ list })) } } as never,
      httpErrors as never,
    );

    await expect(service.markUploaded(OWNER_ID, POST_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("removes an owned uploading post and its video after an abandoned upload", async () => {
    const deleted = queryBuilder({
      data: { video_path: `${OWNER_ID}/${POST_ID}.mp4` },
      error: null,
    });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValueOnce(deleted);
    const service = createDanceService(
      { from, storage: { from: vi.fn(() => ({ remove })) } } as never,
      httpErrors as never,
    );

    await expect(service.discardUploadingPost(OWNER_ID, POST_ID)).resolves.toBeUndefined();

    expect(remove).toHaveBeenCalledWith([`${OWNER_ID}/${POST_ID}.mp4`]);
    expect(deleted.delete).toHaveBeenCalledOnce();
    expect(deleted.select).toHaveBeenCalledWith("video_path");
    expect(deleted.eq).toHaveBeenCalledWith("status", "uploading");
  });

  it("does not discard a post that has already left the uploading state", async () => {
    const deleted = queryBuilder({ data: null, error: null });
    const remove = vi.fn();
    const service = createDanceService(
      {
        from: vi.fn().mockReturnValue(deleted),
        storage: { from: vi.fn(() => ({ remove })) },
      } as never,
      httpErrors as never,
    );

    await expect(service.discardUploadingPost(OWNER_ID, POST_ID)).resolves.toBeUndefined();

    expect(remove).not.toHaveBeenCalled();
  });

  it("returns the normalized score status only for the requesting owner", async () => {
    const post = queryBuilder({ data: { status: "scored", score: 72 }, error: null });
    const scan = queryBuilder({
      data: { status: "completed", is_external_score: true },
      error: null,
    });
    const from = vi.fn().mockReturnValueOnce(scan).mockReturnValueOnce(post);
    const service = createDanceService({ from } as never, httpErrors as never);

    await expect(service.getScoreStatus(OWNER_ID, POST_ID)).resolves.toEqual({
      status: "scored",
      hasScore: true,
      score: 72,
      isExternalScore: true,
      jobState: "completed",
    });
    expect(post.eq).toHaveBeenCalledWith("owner_id", OWNER_ID);
    expect(scan.eq).toHaveBeenCalledWith("owner_id", OWNER_ID);
  });

  it("reads the scan before the post so a completed scan cannot race its score write", async () => {
    let scanWasRead = false;
    const scan = queryBuilder({
      data: { status: "processing", is_external_score: false },
      error: null,
    });
    const post = queryBuilder({ data: undefined, error: null });
    const scanMaybeSingle = scan.maybeSingle;
    const postMaybeSingle = post.maybeSingle;
    if (!scanMaybeSingle || !postMaybeSingle) throw new Error("Expected score query builders");
    scanMaybeSingle.mockImplementation(async () => {
      scanWasRead = true;
      return { data: { status: "processing", is_external_score: false }, error: null };
    });
    postMaybeSingle.mockImplementation(async () => ({
      data: scanWasRead ? { status: "scored", score: 63 } : { status: "scoring", score: null },
      error: null,
    }));
    const service = createDanceService(
      { from: vi.fn().mockReturnValueOnce(scan).mockReturnValueOnce(post) } as never,
      httpErrors as never,
    );

    await expect(service.getScoreStatus(OWNER_ID, POST_ID)).resolves.toEqual({
      status: "scored",
      hasScore: true,
      score: 63,
      isExternalScore: false,
      jobState: "processing",
    });
  });

  it("does not reveal score status for a post that is absent or not owned", async () => {
    const scan = queryBuilder({ data: null, error: null });
    const post = queryBuilder({ data: null, error: null });
    const service = createDanceService(
      { from: vi.fn().mockReturnValueOnce(scan).mockReturnValueOnce(post) } as never,
      httpErrors as never,
    );

    await expect(service.getScoreStatus(OWNER_ID, POST_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
