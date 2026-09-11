import { describe, expect, it, vi } from "vitest";
import { createDanceService } from "../src/modules/dance/service.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const MOVE_ID = "22222222-2222-4222-8222-222222222222";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_AT = "2026-09-11T00:00:00.000Z";

const httpErrors = {
  conflict: (message: string) => Object.assign(new Error(message), { statusCode: 409 }),
  internalServerError: (message: string) => Object.assign(new Error(message), { statusCode: 500 }),
  notFound: (message: string) => Object.assign(new Error(message), { statusCode: 404 }),
};

function queryBuilder(result: { count?: number; data?: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () => query;
  for (const method of ["delete", "eq", "insert", "not", "select", "update", "upsert"]) {
    query[method] = vi.fn(chain);
  }
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  // biome-ignore lint/suspicious/noThenProperty: mirrors Supabase's awaitable query builder
  query.then = vi.fn((onfulfilled: (value: unknown) => unknown) => Promise.resolve(result).then(onfulfilled));
  return query;
}

function postRow(status = "uploading") {
  return {
    id: POST_ID,
    owner_id: OWNER_ID,
    dance_move_id: MOVE_ID,
    music_id: null,
    status,
    score: null,
    video_length_s: 12,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  };
}

describe("dance post service", () => {
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

  it("removes a newly-created post when minting its upload URL fails", async () => {
    const move = queryBuilder({ data: { id: MOVE_ID, music_id: null }, error: null });
    const insert = queryBuilder({ error: null });
    const cleanup = queryBuilder({ error: null });
    const from = vi.fn().mockReturnValueOnce(move).mockReturnValueOnce(insert).mockReturnValueOnce(cleanup);
    const service = createDanceService(
      {
        from,
        storage: { from: vi.fn(() => ({ createSignedUploadUrl: vi.fn().mockResolvedValue({ data: null, error: {} }) })) },
      } as never,
      httpErrors as never,
    );

    await expect(service.createPost(OWNER_ID, { danceMoveId: MOVE_ID, videoLength: 12 })).rejects.toMatchObject({
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
    const from = vi.fn().mockReturnValueOnce(existing).mockReturnValueOnce(uploaded).mockReturnValueOnce(queued);
    const service = createDanceService(
      { from, storage: { from: vi.fn(() => ({ list })) } } as never,
      httpErrors as never,
    );

    await expect(service.markUploaded(OWNER_ID, POST_ID)).resolves.toMatchObject({ status: "uploaded" });
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

    await expect(service.markUploaded(OWNER_ID, POST_ID)).rejects.toMatchObject({ statusCode: 409 });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("returns the normalized score status only for the requesting owner", async () => {
    const post = queryBuilder({ data: { status: "scored", score: 72 }, error: null });
    const scan = queryBuilder({ data: { status: "completed", is_external_score: true }, error: null });
    const from = vi.fn().mockReturnValueOnce(post).mockReturnValueOnce(scan);
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

  it("does not reveal score status for a post that is absent or not owned", async () => {
    const post = queryBuilder({ data: null, error: null });
    const service = createDanceService({ from: vi.fn().mockReturnValue(post) } as never, httpErrors as never);

    await expect(service.getScoreStatus(OWNER_ID, POST_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});
