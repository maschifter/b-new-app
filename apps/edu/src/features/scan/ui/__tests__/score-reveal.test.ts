let mockReducedMotion = false;

jest.mock("react-native-reanimated", () => ({
  ...require("react-native-reanimated/mock"),
  useReducedMotion: () => mockReducedMotion,
}));

import { act, render, screen } from "@testing-library/react-native";
import { createElement } from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { progressAnnouncementMilestone, ScoreReveal } from "../score-reveal";

function renderScoredReveal(score: number) {
  return render(
    createElement(
      SafeAreaProvider,
      { initialMetrics: { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } } },
      createElement(ScoreReveal, {
        submission: { kind: "scored", score },
        moveTitle: "Two Step",
        actions: createElement(Text, null, "Actions"),
        onRetryUpload: jest.fn(),
      }),
    ),
  );
}

function renderScanningReveal() {
  return render(
    createElement(
      SafeAreaProvider,
      { initialMetrics: { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } } },
      createElement(ScoreReveal, {
        submission: { kind: "scanning", isSlow: false },
        moveTitle: "Two Step",
        actions: createElement(Text, null, "Actions"),
        onRetryUpload: jest.fn(),
      }),
    ),
  );
}

beforeEach(() => {
  mockReducedMotion = false;
});

describe("progressAnnouncementMilestone", () => {
  it("announces only crossed ten-percent milestones and the terminal hold", () => {
    expect(progressAnnouncementMilestone(5, 9)).toBeNull();
    expect(progressAnnouncementMilestone(5, 10)).toBe(10);
    expect(progressAnnouncementMilestone(10, 49)).toBe(40);
    expect(progressAnnouncementMilestone(90, 95)).toBe(95);
  });

  it("starts a retried scan from the initial announcement state", () => {
    expect(progressAnnouncementMilestone(0, 5)).toBeNull();
    expect(progressAnnouncementMilestone(5, 10)).toBe(10);
  });
});

describe("ScoreReveal decorations", () => {
  it("shows the all-score ray burst but reserves approval decoration for scores of 70 or above", () => {
    const view = renderScoredReveal(69);

    expect(view.UNSAFE_getByProps({ testID: "score-ray-burst" })).toBeDefined();
    expect(() => view.UNSAFE_getByProps({ testID: "approved-decoration" })).toThrow();
    view.rerender(
      createElement(
        SafeAreaProvider,
        { initialMetrics: { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } } },
        createElement(ScoreReveal, {
          submission: { kind: "scored", score: 70 },
          moveTitle: "Two Step",
          actions: createElement(Text, null, "Actions"),
          onRetryUpload: jest.fn(),
        }),
      ),
    );

    expect(view.UNSAFE_getByProps({ testID: "approved-decoration" })).toBeDefined();
    expect(view.UNSAFE_getByProps({ testID: "approved-sparkles" })).toBeDefined();
  });
});

describe("ScoreReveal stages", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps scored actions out of the tree until the reveal gate opens", () => {
    jest.useFakeTimers();
    renderScoredReveal(82);

    expect(screen.queryByText("Actions")).not.toBeOnTheScreen();

    act(() => jest.advanceTimersByTime(1_200));

    expect(screen.getByText("Actions")).toBeOnTheScreen();
  });

  it("shows scored actions immediately when reduced motion is enabled", () => {
    mockReducedMotion = true;
    renderScoredReveal(82);

    expect(screen.getByText("Actions")).toBeOnTheScreen();
  });

  it("starts scanning from five percent and advances on its first interval", () => {
    jest.useFakeTimers();
    renderScanningReveal();

    expect(screen.getByLabelText("Scoring your dance, 5 percent")).toBeOnTheScreen();
    act(() => jest.advanceTimersByTime(500));
    expect(screen.getByLabelText("Scoring your dance, 6 percent")).toBeOnTheScreen();
  });
});
