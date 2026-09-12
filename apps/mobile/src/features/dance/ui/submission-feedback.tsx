import { BouncablePress } from "@/components/bouncable-press";
import { Text, View } from "react-native";
import type { SubmissionState } from "./submission-state";

interface SubmissionFeedbackProps {
  submission: SubmissionState;
  onRetry: () => void;
}

export function SubmissionFeedback({ submission, onRetry }: SubmissionFeedbackProps) {
  if (submission.kind === "idle") return null;
  if (submission.kind === "uploading")
    return <Text className="text-sm text-muted">Uploading your dance…</Text>;
  if (submission.kind === "scanning")
    return <Text className="text-sm text-muted">Scoring your dance…</Text>;
  if (submission.kind === "scored")
    return <Text className="text-sm text-neon">You scored {submission.score} points!</Text>;
  return (
    <View className="gap-2">
      <Text accessibilityLiveRegion="polite" className="text-sm text-red-400">
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
