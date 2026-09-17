import { coerceLearnedMoves, coercePersonalRecordings } from "@/lib/collection/coerce";

const LEARNED_AT = "2026-09-17T10:00:00.000Z";

function storedMove(overrides: Record<string, unknown> = {}) {
  return {
    moveId: "a",
    savedScore: 70,
    isExternalScore: true,
    learnedAt: LEARNED_AT,
    updatedAt: LEARNED_AT,
    move: {
      title: "Two Step",
      thumbnailUrl: null,
      genreIds: ["hiphop"],
      level: 1,
      videoUrl: "https://cdn.example.test/two-step.mp4",
    },
    ...overrides,
  };
}

describe("coerceLearnedMoves", () => {
  it("drops one corrupt record and keeps the rest", () => {
    const coerced = coerceLearnedMoves({
      a: storedMove(),
      b: "not a record",
      c: storedMove({ moveId: "c" }),
    });

    expect(Object.keys(coerced).sort()).toEqual(["a", "c"]);
  });

  it("drops a record whose moveId disagrees with its key", () => {
    expect(coerceLearnedMoves({ a: storedMove({ moveId: "b" }) })).toEqual({});
  });

  it("yields an empty map for a non-object, an array and null", () => {
    expect(coerceLearnedMoves("nonsense")).toEqual({});
    expect(coerceLearnedMoves([storedMove()])).toEqual({});
    expect(coerceLearnedMoves(null)).toEqual({});
  });

  it("coerces a missing isExternalScore to true", () => {
    const coerced = coerceLearnedMoves({ a: storedMove({ isExternalScore: undefined }) });

    expect(coerced.a?.isExternalScore).toBe(true);
  });

  it("falls back to learnedAt for a missing updatedAt", () => {
    const coerced = coerceLearnedMoves({ a: storedMove({ updatedAt: undefined }) });

    expect(coerced.a?.updatedAt).toBe(LEARNED_AT);
  });

  it("rejects a level of 0, a savedScore of 101 and a missing videoUrl", () => {
    const base = storedMove().move;

    expect(coerceLearnedMoves({ a: storedMove({ move: { ...base, level: 0 } }) })).toEqual({});
    expect(coerceLearnedMoves({ a: storedMove({ savedScore: 101 }) })).toEqual({});
    expect(
      coerceLearnedMoves({ a: storedMove({ move: { ...base, videoUrl: undefined } }) }),
    ).toEqual({});
  });

  it("filters non-strings out of genreIds and drops unknown fields", () => {
    const base = storedMove().move;
    const coerced = coerceLearnedMoves({
      a: storedMove({ move: { ...base, genreIds: ["hiphop", 3, null] }, userId: "nope" }),
    });

    expect(coerced.a?.move.genreIds).toEqual(["hiphop"]);
    expect(coerced.a).not.toHaveProperty("userId");
  });
});

describe("coercePersonalRecordings", () => {
  const stored = {
    moveId: "a",
    fileUri: "file:///documents/a.mp4",
    createdAt: LEARNED_AT,
    durationS: 8,
  };

  it("keeps a valid record and drops the malformed ones around it", () => {
    const coerced = coercePersonalRecordings({
      a: stored,
      b: { ...stored, moveId: "b", durationS: 0 },
      c: { ...stored, moveId: "c", fileUri: "" },
      d: { ...stored, moveId: "d", createdAt: "not a date" },
    });

    expect(Object.keys(coerced)).toEqual(["a"]);
    expect(coerced.a).toEqual(stored);
  });

  it("yields an empty map for a non-object", () => {
    expect(coercePersonalRecordings(42)).toEqual({});
  });
});
