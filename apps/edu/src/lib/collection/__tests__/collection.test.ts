import {
  averageScore,
  averageScorePercent,
  deletePersonalRecording,
  learnedCount,
  learnedCountByGenre,
  learnedMovesByGenre,
  recordFirstScan,
  saveConfirmedScore,
  savePersonalRecording,
} from "@/lib/collection";
import type { LearnedMove, LearnedMoveSnapshot, PersonalRecording } from "@/lib/collection";

const LEARNED_AT = "2026-09-17T10:00:00.000Z";
const LATER = "2026-09-18T11:30:00.000Z";

function snapshot(overrides: Partial<LearnedMoveSnapshot> = {}): LearnedMoveSnapshot {
  return {
    title: "Two Step",
    thumbnailUrl: null,
    genreIds: ["hiphop"],
    level: 1,
    videoUrl: "https://cdn.example.test/two-step.mp4",
    ...overrides,
  };
}

function learn(
  moves: Record<string, LearnedMove>,
  moveId: string,
  score: number,
  overrides: { isExternalScore?: boolean; snapshot?: LearnedMoveSnapshot; now?: string } = {},
): Record<string, LearnedMove> {
  return recordFirstScan(
    moves,
    {
      moveId,
      score,
      isExternalScore: overrides.isExternalScore ?? true,
      snapshot: overrides.snapshot ?? snapshot(),
    },
    overrides.now ?? LEARNED_AT,
  );
}

describe("averageScore", () => {
  it("is the arithmetic mean of the saved scores", () => {
    const moves = learn(learn({}, "a", 20), "b", 100);

    expect(averageScore(moves)).toBe(60);
  });

  it("is null for an empty collection", () => {
    expect(averageScore({})).toBeNull();
  });

  it("is not rounded", () => {
    expect(averageScore(learn(learn({}, "a", 20), "b", 91))).toBe(55.5);
    expect(averageScore(learn(learn(learn({}, "a", 20), "b", 90), "c", 92))).toBe(202 / 3);
  });
});

describe("averageScorePercent", () => {
  it("rounds the mean to a whole percentage", () => {
    expect(averageScorePercent(learn(learn({}, "a", 20), "b", 91))).toBe(56);
    expect(averageScorePercent(learn(learn(learn({}, "a", 20), "b", 90), "c", 92))).toBe(67);
  });

  it("is null for an empty collection, so the ring renders `--` rather than 0%", () => {
    expect(averageScorePercent({})).toBeNull();
  });

  it("stays inside the ring's 0..100 range at both ends", () => {
    expect(averageScorePercent(learn({}, "a", 0))).toBe(0);
    expect(averageScorePercent(learn({}, "a", 100))).toBe(100);
  });
});

describe("learnedMovesByGenre", () => {
  it("lists a genre's moves most recently learned first", () => {
    const moves = learn(
      learn({}, "a", 40, { snapshot: snapshot({ genreIds: ["hiphop"] }) }),
      "b",
      60,
      { snapshot: snapshot({ genreIds: ["hiphop"] }), now: LATER },
    );

    expect(learnedMovesByGenre(moves, "hiphop").map((move) => move.moveId)).toEqual(["b", "a"]);
  });

  it("breaks a shared timestamp on moveId, so the order does not depend on insertion", () => {
    const first = learn(learn({}, "b", 40), "a", 60);
    const second = learn(learn({}, "a", 60), "b", 40);

    expect(learnedMovesByGenre(first, "hiphop").map((move) => move.moveId)).toEqual(["a", "b"]);
    expect(learnedMovesByGenre(second, "hiphop").map((move) => move.moveId)).toEqual(["a", "b"]);
  });

  it("returns a move that belongs to two genres from both, and the learned count counts it once", () => {
    const moves = learn(
      learn({}, "a", 70, { snapshot: snapshot({ genreIds: ["hiphop", "afro"] }) }),
      "b",
      50,
      { snapshot: snapshot({ genreIds: ["afro"] }) },
    );

    expect(learnedMovesByGenre(moves, "hiphop")).toHaveLength(1);
    expect(learnedMovesByGenre(moves, "afro")).toHaveLength(2);
    expect(learnedCount(moves)).toBe(2);
  });

  it("leaves a move whose genres match no section out of every section", () => {
    const moves = learn({}, "a", 70, { snapshot: snapshot({ genreIds: [] }) });

    expect(learnedMovesByGenre(moves, "hiphop")).toEqual([]);
    expect(learnedCount(moves)).toBe(1);
  });
});

describe("recordFirstScan", () => {
  it("creates one record and keeps the first score and date on a repeat call", () => {
    const first = learn({}, "a", 40);
    const second = learn(first, "a", 95, { now: LATER });

    expect(second).toBe(first);
    expect(learnedCount(second)).toBe(1);
    expect(second.a?.savedScore).toBe(40);
    expect(second.a?.learnedAt).toBe(LEARNED_AT);
  });

  it("leaves the collection unchanged for a score outside 0..100", () => {
    expect(learn({}, "a", 101)).toEqual({});
    expect(learn({}, "a", -1)).toEqual({});
  });

  it("leaves the collection unchanged for a non-integer score", () => {
    expect(learn({}, "a", 55.5)).toEqual({});
  });

  it("leaves the collection unchanged for a snapshot the reader would drop", () => {
    expect(learn({}, "a", 80, { snapshot: snapshot({ videoUrl: "" }) })).toEqual({});
    expect(learn({}, "a", 80, { snapshot: snapshot({ level: 0 }) })).toEqual({});
  });

  it("creates a learned move for a fallback score, which enters the average", () => {
    const moves = learn(learn({}, "a", 100), "b", 60, { isExternalScore: false });

    expect(moves.b?.isExternalScore).toBe(false);
    expect(averageScore(moves)).toBe(80);
  });
});

describe("saveConfirmedScore", () => {
  it("replaces a higher score with a lower one and bumps only updatedAt", () => {
    const moves = learn({}, "a", 90);
    const saved = saveConfirmedScore(moves, "a", 40, true, LATER);

    expect(saved.a?.savedScore).toBe(40);
    expect(saved.a?.updatedAt).toBe(LATER);
    expect(saved.a?.learnedAt).toBe(LEARNED_AT);
    expect(saved.a?.move).toEqual(moves.a?.move);
  });

  it("returns the collection unchanged for an unknown move", () => {
    const moves = learn({}, "a", 90);

    expect(saveConfirmedScore(moves, "unknown", 50, true, LATER)).toBe(moves);
  });

  it("leaves the existing record untouched for an invalid score", () => {
    const moves = learn({}, "a", 90, { isExternalScore: false });

    expect(saveConfirmedScore(moves, "a", 101, true, LATER)).toBe(moves);
    expect(saveConfirmedScore(moves, "a", 55.5, true, LATER)).toBe(moves);
    expect(moves.a?.savedScore).toBe(90);
    expect(moves.a?.isExternalScore).toBe(false);
    expect(moves.a?.updatedAt).toBe(LEARNED_AT);
  });
});

describe("learnedCountByGenre", () => {
  it("counts a move that belongs to two genres under both", () => {
    const moves = learn({}, "a", 70, { snapshot: snapshot({ genreIds: ["hiphop", "afro"] }) });

    expect(learnedCountByGenre(moves, "hiphop")).toBe(1);
    expect(learnedCountByGenre(moves, "afro")).toBe(1);
    expect(learnedCountByGenre(moves, "ballet")).toBe(0);
  });
});

describe("personal recordings", () => {
  const recording: PersonalRecording = {
    moveId: "a",
    fileName: "a.mp4",
    createdAt: LEARNED_AT,
    durationS: 8,
  };

  it("keeps exactly one recording per move", () => {
    const once = savePersonalRecording({}, recording);
    const twice = savePersonalRecording(once, { ...recording, fileName: "b.mp4" });

    expect(Object.keys(twice)).toEqual(["a"]);
    expect(twice.a?.fileName).toBe("b.mp4");
  });

  it("rejects a file name that is a path", () => {
    const stored = savePersonalRecording({}, { ...recording, fileName: "file:///documents/a.mp4" });

    expect(stored).toEqual({});
  });

  it("deleting a recording leaves the learned move and its saved score intact", () => {
    const moves = learn({}, "a", 70);
    const recordings = deletePersonalRecording(savePersonalRecording({}, recording), "a");

    expect(recordings).toEqual({});
    expect(moves.a?.savedScore).toBe(70);
  });
});
