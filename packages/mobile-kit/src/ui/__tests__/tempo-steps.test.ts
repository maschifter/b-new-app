import {
  TEMPO_STEPS,
  describeTempoRate,
  formatTempoRate,
  shiftTempoRate,
  snapTempoRate,
  tempoFraction,
  tempoRateAtFraction,
} from "../tempo-steps";

describe("snapTempoRate", () => {
  it("lands on the nearest offered level", () => {
    expect(snapTempoRate(0.6)).toBe(0.5);
    expect(snapTempoRate(0.7)).toBe(0.75);
    expect(snapTempoRate(0.11)).toBe(0.1);
    expect(snapTempoRate(0.2)).toBe(0.25);
  });

  it("resolves a tie to the slower level", () => {
    expect(snapTempoRate(0.625)).toBe(0.5);
  });

  it("clamps a value past either end onto the end level", () => {
    expect(snapTempoRate(-4)).toBe(0.1);
    expect(snapTempoRate(12)).toBe(1);
  });

  it("honours a caller's own scale", () => {
    expect(snapTempoRate(0.9, [0.25, 1, 2])).toBe(1);
  });
});

describe("shiftTempoRate", () => {
  it("moves one level at a time and stops at the ends", () => {
    expect(shiftTempoRate(0.5, 1)).toBe(0.75);
    expect(shiftTempoRate(0.5, -1)).toBe(0.25);
    expect(shiftTempoRate(1, 1)).toBe(1);
    expect(shiftTempoRate(0.1, -1)).toBe(0.1);
  });

  it("snaps an off-grid rate before shifting", () => {
    expect(shiftTempoRate(0.6, 1)).toBe(0.75);
  });
});

describe("tempoFraction", () => {
  it("maps the scale onto the bar, ends included", () => {
    expect(tempoFraction(0.1)).toBe(0);
    expect(tempoFraction(0.5)).toBeCloseTo(0.5, 5);
    expect(tempoFraction(1)).toBe(1);
  });

  it("stays inside the bar for a rate outside the scale", () => {
    expect(tempoFraction(0.1)).toBe(0);
    expect(tempoFraction(3)).toBe(1);
  });
});

it("labels a level rather than a measurement", () => {
  expect(formatTempoRate(1)).toBe("1×");
    expect(formatTempoRate(0.75)).toBe("0.75×");
    expect(formatTempoRate(0.1)).toBe("0.1×");
});

it("spells the multiplier out for speech", () => {
  expect(describeTempoRate(1)).toBe("1 times normal speed");
  expect(describeTempoRate(0.1)).toBe("0.1 times normal speed");
});

it("keeps the shared scale ordered from slowest to fastest", () => {
  expect([...TEMPO_STEPS].sort((a, b) => a - b)).toEqual([...TEMPO_STEPS]);
});

describe("tempoRateAtFraction", () => {
  it("reads the ends of the bar as the ends of the scale", () => {
    expect(tempoRateAtFraction(0)).toBe(0.1);
    expect(tempoRateAtFraction(1)).toBe(1);
  });

  it("snaps a point between two levels to the nearest one", () => {
    expect(tempoRateAtFraction(0.5)).toBe(0.5);
    // The 0.5x-to-0.75x midpoint lies at 0.625 of the evenly spaced scale.
    expect(tempoRateAtFraction(0.6)).toBe(0.5);
    expect(tempoRateAtFraction(0.7)).toBe(0.75);
  });

  it("clamps a point past either end", () => {
    expect(tempoRateAtFraction(-2)).toBe(0.1);
    expect(tempoRateAtFraction(4)).toBe(1);
  });

  it("honours a caller's own scale", () => {
    expect(tempoRateAtFraction(0.5, [1, 2, 3])).toBe(2);
  });

  it("round-trips a level through tempoFraction", () => {
    for (const step of TEMPO_STEPS) {
      expect(tempoRateAtFraction(tempoFraction(step), TEMPO_STEPS)).toBe(step);
    }
  });
});
