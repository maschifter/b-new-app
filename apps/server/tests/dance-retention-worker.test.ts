import { afterEach, describe, expect, it, vi } from "vitest";
import { createRetentionWorker } from "../src/modules/dance/retention-worker.js";
import { createDanceService } from "../src/modules/dance/service.js";
import { httpErrors } from "./helpers/http-errors.js";
import { queryBuilder } from "./helpers/supabase.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_POST_ID = "44444444-4444-4444-8444-444444444444";
const TTL_MS = 24 * 60 * 60 * 1000;

const logger = { error: vi.fn() };

function worker(
  supabase: unknown,
  deletePost: (ownerId: string, postId: string) => Promise<void>,
  sweepLimit = 100,
) {
  return createRetentionWorker({
    deletePost,
    logger: logger as never,
    postTtlMs: TTL_MS,
    supabase: supabase as never,
    sweepIntervalMs: 5 * 60 * 1000,
    sweepLimit,
  });
}

describe("dance retention sweep", () => {
  afterEach(() => {
    vi.useRealTimers();
    logger.error.mockClear();
  });

  it("asks only for expired posts and deletes each one with its storage objects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T12:00:00.000Z"));
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: POST_ID, owner_id: OWNER_ID }],
      error: null,
    });
    const deleted = queryBuilder({ data: { id: POST_ID }, error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      rpc,
      from: vi.fn(() => deleted),
      storage: { from: vi.fn(() => ({ remove })) },
    };
    const dance = createDanceService(supabase as never, httpErrors as never, "dance-videos");

    await worker(supabase, dance.deleteRecordedPost, 25).sweep();

    expect(rpc).toHaveBeenCalledWith("list_expired_anonymous_dance_posts", {
      p_older_than: new Date(Date.now() - TTL_MS).toISOString(),
      p_limit: 25,
    });
    // The guard that keeps an upload in flight out of the sweep lives in the service's
    // own delete, so the sweep inherits it rather than restating it.
    expect(deleted.neq).toHaveBeenCalledWith("status", "uploading");
    expect(deleted.eq).toHaveBeenCalledWith("owner_id", OWNER_ID);
    expect(remove).toHaveBeenCalledWith([
      `${OWNER_ID}/${POST_ID}.mp4`,
      `${OWNER_ID}/${POST_ID}-merged.mp4`,
      `${OWNER_ID}/${POST_ID}.jpg`,
    ]);
  });

  it("carries on through a failed deletion and logs the ids its objects are named from", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { id: POST_ID, owner_id: OWNER_ID },
        { id: SECOND_POST_ID, owner_id: OWNER_ID },
      ],
      error: null,
    });
    const deletePost = vi
      .fn()
      .mockRejectedValueOnce(new Error("Could not remove dance media"))
      .mockResolvedValueOnce(undefined);

    await worker({ rpc }, deletePost).sweep();

    expect(deletePost).toHaveBeenCalledTimes(2);
    expect(deletePost).toHaveBeenLastCalledWith(OWNER_ID, SECOND_POST_ID);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ postId: POST_ID, ownerId: OWNER_ID }),
      expect.any(String),
    );
  });

  it("deletes nothing when the candidate query fails or comes back empty", async () => {
    const deletePost = vi.fn();
    await worker(
      { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) },
      deletePost,
    ).sweep();
    expect(logger.error).toHaveBeenCalledOnce();

    await worker({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) }, deletePost).sweep();
    expect(deletePost).not.toHaveBeenCalled();
  });

  it("never runs two sweeps over the same candidates at once", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: POST_ID, owner_id: OWNER_ID }],
      error: null,
    });
    const deletePost = vi.fn().mockImplementation(() => gate);
    const retention = worker({ rpc }, deletePost);

    const first = retention.sweep();
    await retention.sweep();
    expect(deletePost).toHaveBeenCalledOnce();

    release();
    await first;
    // Safe to run again once the first has drained: the service's delete is idempotent,
    // and the candidate list is re-read every time.
    await retention.sweep();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(deletePost).toHaveBeenCalledTimes(2);
  });
});
