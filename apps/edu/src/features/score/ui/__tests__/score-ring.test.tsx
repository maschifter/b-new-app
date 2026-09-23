import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { ScoreRing, ringHalfRotations } from "../score-ring";

const EMPTY_RIGHT = -135;
const FULL_RIGHT = 45;
const EMPTY_LEFT = 45;
const FULL_LEFT = 225;

it("keeps the established ring geometry at its boundary values", () => {
  expect(ringHalfRotations(0)).toEqual({ right: EMPTY_RIGHT, left: EMPTY_LEFT });
  expect(ringHalfRotations(null)).toEqual({ right: EMPTY_RIGHT, left: EMPTY_LEFT });
  expect(ringHalfRotations(50)).toEqual({ right: FULL_RIGHT, left: EMPTY_LEFT });
  expect(ringHalfRotations(100)).toEqual({ right: FULL_RIGHT, left: FULL_LEFT });
  expect(ringHalfRotations(140)).toEqual({ right: FULL_RIGHT, left: FULL_LEFT });
  expect(ringHalfRotations(-20)).toEqual({ right: EMPTY_RIGHT, left: EMPTY_LEFT });
});

it("applies the supplied geometry and colours", () => {
  render(
    <ScoreRing
      testID="score-ring"
      percent={82}
      size={100}
      strokeWidth={8}
      trackColor="#111111"
      fillColor="#f9cf54"
      accessibilityLabel="Score, 82 out of 100"
    >
      <Text>82 / 100</Text>
    </ScoreRing>,
  );

  expect(screen.getByLabelText("Score, 82 out of 100")).toHaveStyle({ width: 100, height: 100 });
  expect(screen.getByTestId("score-ring-track")).toHaveStyle({ borderWidth: 8, borderColor: "#111111" });
});
