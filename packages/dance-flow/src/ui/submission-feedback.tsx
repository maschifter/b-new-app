import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { SubmissionState } from "./submission-state";

interface SubmissionFeedbackProps {
  submission: SubmissionState;
  onRetry: () => void;
  /**
   * Replaces the scored line for an app that states a score its own way. Every other
   * state stays this component's, so the upload and scoring copy — and the retry
   * affordance the failure depends on — cannot drift between the two apps.
   */
  renderScored?: ((score: number) => ReactNode) | undefined;
  /** Replaces only scanning copy for an app with a distinct pending-score treatment. */
  renderScanning?: ((isSlow: boolean) => ReactNode) | undefined;
}

export function SubmissionFeedback({
  submission,
  onRetry,
  renderScored,
  renderScanning,
}: SubmissionFeedbackProps) {
  if (submission.kind === "idle") return null;
  if (submission.kind === "uploading")
    return <Text className="text-sm text-muted">Uploading your dance…</Text>;
  if (submission.kind === "scanning")
    return renderScanning ? (
      <>{renderScanning(submission.isSlow)}</>
    ) : (
      <View className="gap-1">
        <Text className="text-sm text-muted">Scoring your dance…</Text>
        {submission.isSlow ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-muted">
            Still scoring — you can check back here shortly.
          </Text>
        ) : null}
      </View>
    );
  if (submission.kind === "scored")
    return renderScored ? (
      <>{renderScored(submission.score)}</>
    ) : (
      <Text className="text-sm text-accent">You scored {submission.score} points!</Text>
    );
  return (
    <View className="gap-2">
      <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
        {submission.message}
      </Text>
      {submission.canRetry ? (
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Retry submitting your dance"
          onPress={onRetry}
          className="self-start rounded-xl border border-border px-4 py-2"
        >
          <Text className="text-sm font-bold text-foreground">Retry upload</Text>
        </BouncablePress>
      ) : null}
    </View>
  );
}
