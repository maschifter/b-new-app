import { describe, expect, it, vi } from "vitest";
import { createJobQueue, errorMessage, retryAt } from "../src/modules/dance/job-queue.js";
import { queryBuilder } from "./helpers/supabase.js";

const job = {
  attempts: 0,
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  post_id: "33333333-3333-4333-8333-333333333333",
};

function harness(
  queries: ReturnType<typeof queryBuilder>[],
  overrides: Record<string, unknown> = {},
) {
  const remaining = [...queries];
  const from = vi.fn(() => {
    const query = remaining.shift();
    if (!query) throw new Error("Unexpected Supabase query");
    return query;
  });
  const logger = { error: vi.fn(), info: vi.fn() };
  const process = vi.fn(async () => {});
  const queue = createJobQueue({
    concurrency: 1,
    logger: logger as never,
    name: "dance scan",
    process,
    stuckLockMs: 300_000,
    supabase: { from } as never,
    table: "dance_scans",
    ...overrides,
  });
  return { from, logger, process, queue };
}

describe("dance job queue", () => {
  it("skips a tick that starts while the previous one is still running", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { from, queue } = harness([
      queryBuilder({ error: null }, gate),
      queryBuilder({ count: 1, error: null }),
    ]);

    const first = queue.tick();
    // The interval fires again before the reap has come back.
    await queue.tick();
    expect(from).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("runs the tick-start hook before it reaps, so a sweep can enqueue into the same tick", async () => {
    const order: string[] = [];
    const reap = queryBuilder({ error: null });
    reap.update?.mockImplementation(() => {
      order.push("reap");
      return reap;
    });
    const { queue } = harness([reap, queryBuilder({ count: 1, error: null })], {
      onTickStart: async () => {
        order.push("tick-start");
      },
    });

    await queue.tick();

    expect(order).toEqual(["tick-start", "reap"]);
  });

  it("does not process a row another replica claimed first", async () => {
    const onClaimed = vi.fn(async () => {});
    const { process, queue } = harness(
      [
        queryBuilder({ error: null }),
        queryBuilder({ count: 0, error: null }),
        queryBuilder({ data: [job], error: null }),
        queryBuilder({ data: null, error: null }),
      ],
      { onClaimed },
    );

    await queue.tick();

    expect(process).not.toHaveBeenCalled();
    expect(onClaimed).not.toHaveBeenCalled();
  });

  it("hands a won row to the claim hook and then to the processor", async () => {
    const onClaimed = vi.fn(async () => {});
    const { process, queue } = harness(
      [
        queryBuilder({ error: null }),
        queryBuilder({ count: 0, error: null }),
        queryBuilder({ data: [job], error: null }),
        queryBuilder({ data: job, error: null }),
      ],
      { onClaimed },
    );

    await queue.tick();

    expect(onClaimed).toHaveBeenCalledWith(job);
    expect(process).toHaveBeenCalledWith(job);
  });

  it("aborts the tick when the claim hook fails rather than processing a half-claimed row", async () => {
    const { logger, process, queue } = harness(
      [
        queryBuilder({ error: null }),
        queryBuilder({ count: 0, error: null }),
        queryBuilder({ data: [job], error: null }),
        queryBuilder({ data: job, error: null }),
      ],
      {
        onClaimed: async () => {
          throw new Error("Could not mark dance post as scoring");
        },
      },
    );

    await queue.tick();

    expect(process).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ queue: "dance scan" }),
      "Dance job worker tick failed",
    );
  });

  it("stops claiming once in-flight rows fill the concurrency budget", async () => {
    const { from, process, queue } = harness([
      queryBuilder({ error: null }),
      queryBuilder({ count: 1, error: null }),
    ]);

    await queue.tick();

    expect(process).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(2);
  });
});

describe("retryAt", () => {
  it("backs off exponentially from the base delay", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T00:00:00.000Z"));
    try {
      expect(retryAt(1)).toBe("2026-09-15T00:00:03.000Z");
      expect(retryAt(2)).toBe("2026-09-15T00:00:06.000Z");
      expect(retryAt(3)).toBe("2026-09-15T00:00:12.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("errorMessage", () => {
  it("truncates a long message so it fits the job's error column", () => {
    expect(errorMessage(new Error("x".repeat(900)), "fallback")).toHaveLength(500);
  });

  it("falls back for a thrown non-Error", () => {
    expect(errorMessage("just a string", "Unknown scan error")).toBe("Unknown scan error");
  });
});
