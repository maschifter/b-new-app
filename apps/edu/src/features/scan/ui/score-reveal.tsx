import { ScoreRing } from "@/features/score";
import { COLORS, RUNTIME_COLORS } from "@/lib/theme/colors";
import { SubmissionFeedback } from "@bnewapp/dance-flow/submission-feedback";
import type { SubmissionState } from "@bnewapp/dance-flow/submission-state";
import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import Animated, { BounceIn, FadeIn, FadeOutDown, ZoomInEasyDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface ScoreRevealProps {
  submission: Extract<SubmissionState, { kind: "scanning" } | { kind: "scored" }>;
  moveTitle: string | null;
  actions: ReactNode;
  onRetryUpload: () => void;
}

export function progressAnnouncementMilestone(previous: number, current: number): number | null {
  if (current >= 95 && previous < 95) return 95;
  const milestone = Math.floor(current / 10) * 10;
  return milestone >= 10 && milestone > previous ? milestone : null;
}

export function ScoreReveal({ submission, moveTitle, actions, onRetryUpload }: ScoreRevealProps) {
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState(5);
  const [actionsVisible, setActionsVisible] = useState(reducedMotion);
  const announcedRef = useRef(0);

  useEffect(() => {
    if (submission.kind !== "scanning") return;
    setProgress(5);
    announcedRef.current = 5;
    AccessibilityInfo.announceForAccessibility("Scoring your dance, 5 percent");
  }, [submission.kind]);

  useEffect(() => {
    if (submission.kind !== "scanning" || progress >= 95) return;
    const delay = progress < 50 ? 500 : progress < 75 ? 800 : 1400;
    const timeout = setTimeout(() => setProgress((current) => Math.min(current + 1, 95)), delay);
    return () => clearTimeout(timeout);
  }, [progress, submission.kind]);

  useEffect(() => {
    if (submission.kind !== "scanning") return;
    const milestone = progressAnnouncementMilestone(announcedRef.current, progress);
    if (milestone === null) return;
    announcedRef.current = milestone;
    AccessibilityInfo.announceForAccessibility(`Scoring your dance, ${milestone} percent`);
  }, [progress, submission.kind]);

  useEffect(() => {
    if (submission.kind !== "scored") return;
    setActionsVisible(reducedMotion);
    if (reducedMotion) return;
    const timeout = setTimeout(() => setActionsVisible(true), 1200);
    return () => clearTimeout(timeout);
  }, [reducedMotion, submission.kind]);

  if (submission.kind === "scanning") {
    return (
      <View className="flex-1 items-center justify-center bg-black px-6">
        <Animated.View {...(reducedMotion ? {} : { entering: ZoomInEasyDown, exiting: FadeOutDown })}>
          <ScoreRing percent={progress} size={120} strokeWidth={10} trackColor={RUNTIME_COLORS["score-track-scanning"]} fillColor={COLORS.accent} accessibilityLabel={`Scoring your dance, ${progress} percent`} testID="scoring-ring">
            <Text className="font-bold text-accent text-base">{progress}%</Text>
          </ScoreRing>
        </Animated.View>
        <View className="mt-6 items-center" accessibilityLiveRegion="polite">
          <SubmissionFeedback submission={submission} onRetry={onRetryUpload} renderScanning={(isSlow) => <ScanningCopy isSlow={isSlow} />} />
        </View>
      </View>
    );
  }

  const approved = submission.score >= 70;
  return (
    <LinearGradient
      colors={[RUNTIME_COLORS["celebrate-fade"], RUNTIME_COLORS.celebrate]}
      className="flex-1 justify-end px-6"
      style={{ paddingBottom: insets.bottom + 24 }}
    >
      <View className="items-center gap-2">
        <Text accessibilityRole="header" className="font-display text-center text-4xl text-foreground">Well done!</Text>
        {moveTitle === null ? null : <Text className="text-center text-base text-copy">{moveTitle}</Text>}
        <Animated.View {...(reducedMotion ? {} : { entering: BounceIn.duration(1000) })} className="mt-3 items-center">
          <View className="items-center justify-center rounded-full bg-black p-0">
            <ScoreRing percent={submission.score} size={100} strokeWidth={8} trackColor={RUNTIME_COLORS["score-track-scored"]} fillColor={COLORS.accent} accessibilityLabel={`Score, ${submission.score} out of 100`} testID="scored-ring">
              <Text className="font-bold text-accent text-3xl">{submission.score} / 100</Text>
            </ScoreRing>
          </View>
          {approved ? <ApprovedDecoration /> : null}
        </Animated.View>
      </View>
      {actionsVisible ? <Animated.View {...(reducedMotion ? {} : { entering: FadeIn.duration(1000) })} className="mt-6" testID="score-actions">{actions}</Animated.View> : null}
    </LinearGradient>
  );
}

function ScanningCopy({ isSlow }: { isSlow: boolean }) {
  return <View className="items-center gap-1"><Text className="font-bold text-center text-foreground text-xl">Scoring your dance…</Text>{isSlow ? <Text className="text-center text-base text-copy">Still scoring — you can check back here shortly.</Text> : null}</View>;
}

function ApprovedDecoration() {
  return <View testID="approved-decoration" accessible={false} importantForAccessibility="no-hide-descendants" className="-mt-1 items-center"><LinearGradient colors={[RUNTIME_COLORS["approved-ribbon-highlight"], COLORS.accent]} className="rounded-full px-5 py-1"><Text className="font-display text-xs" style={{ color: RUNTIME_COLORS["approved-ribbon-copy"] }}>APPROVED</Text></LinearGradient></View>;
}
