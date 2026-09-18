import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SubmissionFeedback } from "../submission-feedback";

const onRetry = jest.fn();

it("states the score its own way when the host app supplies nothing", () => {
  render(<SubmissionFeedback submission={{ kind: "scored", score: 82 }} onRetry={onRetry} />);

  expect(screen.getByText("You scored 82 points!")).toBeOnTheScreen();
});

it("hands the score to the host app's own line", () => {
  render(
    <SubmissionFeedback
      submission={{ kind: "scored", score: 82 }}
      onRetry={onRetry}
      renderScored={(score) => <Text>{score} / 100</Text>}
    />,
  );

  expect(screen.getByText("82 / 100")).toBeOnTheScreen();
  expect(screen.queryByText("You scored 82 points!")).not.toBeOnTheScreen();
});

/**
 * The slot is the scored line alone. An app that replaced the whole renderer would be
 * free to drop the retry, which is the only way out of a retryable upload failure.
 */
it("keeps the retry on a failure the host app did not override", () => {
  render(
    <SubmissionFeedback
      submission={{ kind: "failed", message: "Upload failed", canRetry: true }}
      onRetry={onRetry}
      renderScored={(score) => <Text>{score} / 100</Text>}
    />,
  );

  expect(screen.getByText("Upload failed")).toBeOnTheScreen();
  expect(screen.getByLabelText("Retry submitting your dance")).toBeOnTheScreen();
});
