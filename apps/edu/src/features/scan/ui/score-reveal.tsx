import { ScoreRing } from "@/features/score";
import { COLORS, RUNTIME_COLORS } from "@/lib/theme/colors";
import type { SubmissionState } from "@bnewapp/dance-flow/submission-state";
import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import Animated, {
  BounceIn,
  cancelAnimation,
  FadeIn,
  FadeOutDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomInEasyDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface ScoreRevealProps {
  submission: Extract<SubmissionState, { kind: "uploading" } | { kind: "scanning" } | { kind: "scored" }>;
  moveTitle: string | null;
  actions: ReactNode;
}

export function progressAnnouncementMilestone(previous: number, current: number): number | null {
  if (current >= 95 && previous < 95) return 95;
  const milestone = Math.floor(current / 10) * 10;
  return milestone >= 10 && milestone > previous ? milestone : null;
}

export function ScoreReveal({ submission, moveTitle, actions }: ScoreRevealProps) {
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState(0);
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

  if (submission.kind !== "scored") {
    const isUploading = submission.kind === "uploading";
    const displayedProgress = isUploading ? 0 : progress;
    const progressLabel = isUploading
      ? "Uploading your dance"
      : `Scoring your dance, ${displayedProgress} percent`;
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Animated.View {...(reducedMotion ? {} : { entering: ZoomInEasyDown, exiting: FadeOutDown })}>
          <RingDisc size={120}>
            <ScoreRing percent={displayedProgress} size={120} strokeWidth={10} trackColor={RUNTIME_COLORS["score-track-scanning"]} fillColor={COLORS.accent} accessibilityLabel={progressLabel} testID="scoring-ring">
              <Text className="font-bold text-accent text-base">{displayedProgress}%</Text>
            </ScoreRing>
          </RingDisc>
        </Animated.View>
        <View className="mt-6 items-center" accessibilityLiveRegion="polite">
          {isUploading ? <UploadingCopy /> : <ScanningCopy isSlow={submission.isSlow} />}
        </View>
      </View>
    );
  }

  const approved = submission.score >= 70;
  return (
    <View
      testID="score-reveal"
      style={[styles.reveal, { paddingBottom: insets.bottom + 24, paddingTop: insets.top + 24 }]}
    >
      <LinearGradient
        testID="score-bottom-scrim"
        pointerEvents="none"
        colors={["transparent", "rgba(0,0,0,0.72)", "rgba(0,0,0,0.94)"]}
        locations={[0, 0.55, 1]}
        style={[styles.bottomScrim, { height: 256 + insets.bottom }]}
      />
      <View className="flex-1 justify-between">
        <View className="flex-1 items-center justify-center gap-2">
          <Text accessibilityRole="header" className="font-display text-center text-4xl text-foreground">Well done!</Text>
          {moveTitle === null ? null : <Text className="text-center text-base text-copy">{moveTitle}</Text>}
          <Animated.View {...(reducedMotion ? {} : { entering: BounceIn.duration(1000) })} className="mt-3 items-center">
            <ScoreRayBurst reducedMotion={reducedMotion} />
            <RingDisc size={116}>
              <ScoreRing percent={submission.score} size={116} strokeWidth={8} trackColor={RUNTIME_COLORS["score-track-scored"]} fillColor={COLORS.accent} accessibilityLabel={`Score, ${submission.score} out of 100`} testID="scored-ring">
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  numberOfLines={1}
                  style={styles.scoreLabel}
                  className="font-bold text-accent text-3xl"
                >
                  {submission.score}
                  <Text className="font-bold text-accent text-xs"> / 100</Text>
                </Text>
              </ScoreRing>
            </RingDisc>
            {approved ? <ApprovedDecoration reducedMotion={reducedMotion} /> : null}
          </Animated.View>
        </View>
        {actionsVisible ? <Animated.View {...(reducedMotion ? {} : { entering: FadeIn.duration(1000) })} testID="score-actions">{actions}</Animated.View> : null}
      </View>
    </View>
  );
}

function ScanningCopy({ isSlow }: { isSlow: boolean }) {
  return <View className="items-center gap-1"><Text className="font-bold text-center text-foreground text-xl">Scoring your dance…</Text>{isSlow ? <Text className="text-center text-base text-copy">Still scoring — you can check back here shortly.</Text> : null}</View>;
}

function UploadingCopy() {
  return (
    <View className="items-center gap-1">
      <Text className="font-bold text-center text-foreground text-xl">Uploading your dance…</Text>
      <Text className="text-center text-base text-copy">Getting your video ready for scoring.</Text>
    </View>
  );
}

function RingDisc({ size, children }: { size: number; children: ReactNode }) {
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} className="bg-black" />
      {children}
    </View>
  );
}

function ScoreRayBurst({ reducedMotion }: { reducedMotion: boolean }) {
  const rotation = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(rotation);
      rotation.value = 0;
      return;
    }
    rotation.value = withRepeat(withTiming(360, { duration: 30_000 }), -1);
    return () => cancelAnimation(rotation);
  }, [reducedMotion, rotation]);

  return (
    <Animated.View
      testID="score-ray-burst"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.rayBurst, animatedStyle]}
    >
      {RAY_ANGLES.map((angle) => <View key={angle} style={[styles.ray, { transform: [{ rotate: `${angle}deg` }] }]} />)}
    </Animated.View>
  );
}

function ApprovedDecoration({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <View testID="approved-decoration" accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.approvedDecoration}>
      <Sparkles reducedMotion={reducedMotion} />
      <View style={[styles.ribbonTail, styles.ribbonTailLeft]} />
      <View style={[styles.ribbonTail, styles.ribbonTailRight]} />
      <LinearGradient colors={[RUNTIME_COLORS["approved-ribbon-highlight"], COLORS.accent]} style={styles.ribbon}>
        <Text className="font-display text-xs" style={{ color: RUNTIME_COLORS["approved-ribbon-copy"] }}>APPROVED</Text>
      </LinearGradient>
    </View>
  );
}

function Sparkles({ reducedMotion }: { reducedMotion: boolean }) {
  const opacity = useSharedValue(reducedMotion ? 0.75 : 1);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(opacity);
      opacity.value = 0.75;
      return;
    }
    opacity.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  return <Animated.View testID="approved-sparkles" style={[styles.sparkleLayer, animatedStyle]}>{SPARKLES.map((sparkle) => <View key={sparkle.id} style={[styles.sparkle, sparkle.style]} />)}</Animated.View>;
}

const RAY_ANGLES = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
const SPARKLES = [
  { id: "one", style: { top: 2, left: 2, width: 6, height: 6, borderRadius: 3 } },
  { id: "two", style: { top: 24, right: -4, width: 8, height: 8, borderRadius: 4 } },
  { id: "three", style: { bottom: 0, left: 18, width: 5, height: 5, borderRadius: 1 } },
  { id: "four", style: { bottom: 16, right: 4, width: 6, height: 6, borderRadius: 3 } },
] as const;

const styles = StyleSheet.create({
  reveal: { ...StyleSheet.absoluteFillObject, paddingHorizontal: 24 },
  bottomScrim: { position: "absolute", bottom: 0, left: 0, right: 0 },
  rayBurst: { position: "absolute", width: 148, height: 148, alignItems: "center", justifyContent: "center" },
  ray: { position: "absolute", top: 0, width: 2, height: 26, borderRadius: 1, backgroundColor: COLORS.accent, opacity: 0.3, transformOrigin: "1px 74px" },
  scoreLabel: { maxWidth: 100, textAlign: "center" },
  approvedDecoration: { position: "absolute", width: 140, height: 80, alignItems: "center", top: 90 },
  ribbon: { paddingHorizontal: 20, paddingVertical: 4, borderRadius: 999, zIndex: 1 },
  ribbonTail: { position: "absolute", top: 10, width: 28, height: 18, backgroundColor: COLORS.accent },
  ribbonTailLeft: { left: 14, transform: [{ skewX: "-25deg" }] },
  ribbonTailRight: { right: 14, transform: [{ skewX: "25deg" }] },
  sparkleLayer: { ...StyleSheet.absoluteFillObject },
  sparkle: { position: "absolute", backgroundColor: COLORS.accent },
});
