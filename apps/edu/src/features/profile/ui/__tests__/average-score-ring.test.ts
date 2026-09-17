import { ringHalfRotations } from "../average-score-ring";

/**
 * An empty half is the arc rotated entirely behind the other half's mask, and a full one
 * is it rotated entirely into view. The three boundaries are where a masked-halves ring
 * goes wrong, so they are pinned here rather than on the device alone.
 */
const EMPTY_RIGHT = -135;
const FULL_RIGHT = 45;
const EMPTY_LEFT = 45;
const FULL_LEFT = 225;

it("leaves both halves empty at 0% and at no score at all", () => {
  expect(ringHalfRotations(0)).toEqual({ right: EMPTY_RIGHT, left: EMPTY_LEFT });
  expect(ringHalfRotations(null)).toEqual({ right: EMPTY_RIGHT, left: EMPTY_LEFT });
});

it("fills exactly the right half at 50%", () => {
  expect(ringHalfRotations(50)).toEqual({ right: FULL_RIGHT, left: EMPTY_LEFT });
});

it("fills both halves at 100%", () => {
  expect(ringHalfRotations(100)).toEqual({ right: FULL_RIGHT, left: FULL_LEFT });
});

it("advances the right half below 50% and holds it full above", () => {
  expect(ringHalfRotations(25)).toEqual({ right: -45, left: EMPTY_LEFT });
  expect(ringHalfRotations(75)).toEqual({ right: FULL_RIGHT, left: 135 });
});

it("clamps a value outside 0..100 rather than over-rotating", () => {
  expect(ringHalfRotations(140)).toEqual({ right: FULL_RIGHT, left: FULL_LEFT });
  expect(ringHalfRotations(-20)).toEqual({ right: EMPTY_RIGHT, left: EMPTY_LEFT });
});
