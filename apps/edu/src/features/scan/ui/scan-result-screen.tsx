import {
  learnedMovesAtom,
  personalRecordingsAtom,
  recordFirstScanAtom,
  saveConfirmedScoreAtom,
  savePersonalRecordingAtom,
} from "@/lib/collection";
import type { LearnedMoveSnapshot } from "@/lib/collection";
import { resolvePreviewMedia } from "@bnewapp/dance-core";
import { optionalDanceMoveAtomFamily } from "@bnewapp/dance-flow/atoms";
import type { SubmissionState } from "@bnewapp/dance-flow/submission-state";
import { useDanceSubmission } from "@bnewapp/dance-flow/use-dance-submission";
import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import type { DanceMove } from "@bnewapp/types";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { discardScanUploadMutationAtom } from "../_atoms/mutations";
import { scanDecisionAtom } from "../_atoms/ui";
import { deleteTemporaryClip, isPlayableClip, savePersonalRecordingFile } from "../recording-store";
import { type VideoStep, videoStep } from "../result-flow";
import { ReplaceVideoScreen } from "./replace-video-screen";
import { SaveVideoScreen } from "./save-video-screen";

interface ScanResultScreenProps {
  moveId: string;
  clipPath: string;
  clipDuration: number;
  /** Music playhead at the first recorded frame; forwarded to the merge worker only. */
  clipAudioOffsetMs?: number | undefined;
  onBack: () => void;
  onFinished: () => void;
}

/**
 * Stepz's own result screen. The replay is silent: this app publishes nothing, so the
 * clip exists only to give the Save My Video decision something to look at.
 *
 * `pending` means the score is not terminal yet. `ready` carries whether this attempt
 * created the learned move, because that decides what the confirmation writes.
 *
 * The two failures are distinct because they retry differently: `missing-move` clears
 * itself the moment the move query yields a snapshot, so the retry is a refetch, while
 * `write-failed` must wait for an explicit re-attempt or the effect would loop.
 */
type SaveState =
  | { kind: "pending" }
  | { kind: "ready"; isFirstScan: boolean }
  | { kind: "missing-move" }
  | { kind: "write-failed" };

export function ScanResultScreen({
  moveId,
  clipPath,
  clipDuration,
  clipAudioOffsetMs,
  onBack,
  onFinished,
}: ScanResultScreenProps) {
  const player = useVideoPlayer(clipPath, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
  });
  useFocusedPlayback(player, true);

  const store = useStore();
  const move = useAtomValue(optionalDanceMoveAtomFamily(moveId));
  const [decision, setDecision] = useAtom(scanDecisionAtom);
  const recordFirstScan = useSetAtom(recordFirstScanAtom);
  const saveConfirmedScore = useSetAtom(saveConfirmedScoreAtom);
  const savePersonalRecording = useSetAtom(savePersonalRecordingAtom);
  const discardUpload = useAtomValue(discardScanUploadMutationAtom);

  const { submission, scoreStatus, isTerminal, retry, getSubmittedPostId } = useDanceSubmission({
    moveId,
    clipPath,
    clipDuration,
    clipAudioOffsetMs,
  });

  // `deriveSubmissionState` only reports `scored` when the polled status carries a score,
  // so the flag is read off that same status rather than defaulted.
  const scoredValue = submission.kind === "scored" ? submission.score : null;
  const isExternalScore = scoreStatus?.isExternalScore === true;

  const [saveState, setSaveState] = useState<SaveState>({ kind: "pending" });
  const [isRetryingSave, setIsRetryingSave] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [step, setStep] = useState<VideoStep | null>(null);
  const [isSavingVideo, setIsSavingVideo] = useState(false);
  const [hasVideoSaveFailed, setHasVideoSaveFailed] = useState(false);

  // An unconfirmed attempt must leave nothing behind, so the step resets when the
  // screen goes away.
  useEffect(() => () => setDecision("score"), [setDecision]);

  const discardedPostIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isTerminal) return;
    const postId = getSubmittedPostId();
    if (postId === null || discardedPostIdRef.current === postId) return;
    discardedPostIdRef.current = postId;
    discardUpload.mutate(postId);
  }, [discardUpload.mutate, getSubmittedPostId, isTerminal]);

  // A first terminal score saves itself (document 02 section 2); a repeat scan writes
  // nothing until the user confirms. Both writers reject silently, so the collection is
  // read back before the screen treats the score as saved.
  useEffect(() => {
    if (scoredValue === null) return;
    if (saveState.kind === "ready" || saveState.kind === "write-failed") return;
    const detail = move.data;
    if (detail === undefined) {
      // A move still in flight is not yet a failure; in the normal path it is a warm
      // cache read the record screen already resolved.
      if (!move.isFetching && saveState.kind !== "missing-move") {
        setSaveState({ kind: "missing-move" });
      }
      return;
    }
    if (store.get(learnedMovesAtom)[moveId] !== undefined) {
      setSaveState({ kind: "ready", isFirstScan: false });
      return;
    }
    recordFirstScan({
      moveId,
      score: scoredValue,
      isExternalScore,
      snapshot: snapshotOf(detail),
    });
    setSaveState(
      store.get(learnedMovesAtom)[moveId] === undefined
        ? { kind: "write-failed" }
        : { kind: "ready", isFirstScan: true },
    );
  }, [
    isExternalScore,
    move.data,
    move.isFetching,
    moveId,
    recordFirstScan,
    saveState.kind,
    scoredValue,
    store,
  ]);

  const retrySave = async () => {
    if (isRetryingSave) return;
    if (saveState.kind !== "missing-move") {
      setSaveState({ kind: "pending" });
      return;
    }
    setIsRetryingSave(true);
    try {
      // The effect picks the snapshot up from the query; a refetch that fails again
      // leaves the screen exactly where it was.
      await move.refetch();
    } finally {
      setIsRetryingSave(false);
    }
  };

  const finish = useCallback(() => {
    setDecision("done");
    onFinished();
  }, [onFinished, setDecision]);

  const confirmScore = () => {
    if (scoredValue === null || saveState.kind !== "ready" || isAdvancing) return;
    setIsAdvancing(true);
    if (!saveState.isFirstScan) {
      saveConfirmedScore({ moveId, score: scoredValue, isExternalScore });
      if (store.get(learnedMovesAtom)[moveId]?.savedScore !== scoredValue) {
        setSaveState({ kind: "write-failed" });
        setIsAdvancing(false);
        return;
      }
    }
    const next = videoStep({
      hasTemporaryClip: isPlayableClip(clipPath),
      hasPersonalRecording: store.get(personalRecordingsAtom)[moveId] !== undefined,
    });
    if (next.kind === "none") {
      finish();
      return;
    }
    setStep(next);
    setDecision("video");
  };

  // Both prompts share one secondary action: keep whatever already exists, drop the
  // temporary capture, and continue with the score that was just saved.
  const isSavingVideoRef = useRef(false);
  const declineVideo = useCallback(() => {
    if (isSavingVideoRef.current) return;
    deleteTemporaryClip(clipPath);
    finish();
  }, [clipPath, finish]);

  const saveVideo = () => {
    if (isSavingVideoRef.current) return;
    isSavingVideoRef.current = true;
    setIsSavingVideo(true);
    try {
      savePersonalRecordingFile({
        moveId,
        clipPath,
        durationS: clipDuration,
        previousFileName: store.get(personalRecordingsAtom)[moveId]?.fileName ?? null,
        persist: savePersonalRecording,
        readPersisted: (id) => store.get(personalRecordingsAtom)[id]?.fileName ?? null,
      });
      finish();
    } catch {
      isSavingVideoRef.current = false;
      setIsSavingVideo(false);
      setHasVideoSaveFailed(true);
    }
  };

  // The video steps are states inside one route, so hardware Back would pop the screen
  // and leak the temporary clip. It performs the secondary action instead — the
  // document's own safe default in both prompts.
  useEffect(() => {
    if (decision !== "video") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      declineVideo();
      return true;
    });
    return () => subscription.remove();
  }, [declineVideo, decision]);

  return (
    <SafeAreaView className="flex-1 bg-black" edges={["top", "right", "bottom", "left"]}>
      <View className="flex-1 bg-black">
        <VideoView player={player} contentFit="cover" nativeControls={false} style={styles.video} />
        <View className="gap-4 bg-app px-4 py-6">
          {decision === "video" && step !== null ? (
            step.kind === "replace" ? (
              <ReplaceVideoScreen
                isSaving={isSavingVideo}
                hasFailed={hasVideoSaveFailed}
                onReplace={saveVideo}
                onKeepExisting={declineVideo}
              />
            ) : (
              <SaveVideoScreen
                moveTitle={move.data?.title ?? ""}
                isSaving={isSavingVideo}
                hasFailed={hasVideoSaveFailed}
                onSave={saveVideo}
                onSkip={declineVideo}
              />
            )
          ) : (
            <ScorePanel
              submission={submission}
              moveTitle={move.data?.title ?? null}
              hasSaveError={saveState.kind === "missing-move" || saveState.kind === "write-failed"}
              isRetryingSave={isRetryingSave}
              canConfirm={scoredValue !== null && saveState.kind === "ready"}
              isAdvancing={isAdvancing}
              onRetrySave={retrySave}
              onRetryUpload={retry}
              onConfirm={confirmScore}
              onBack={onBack}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

interface ScorePanelProps {
  submission: SubmissionState;
  moveTitle: string | null;
  hasSaveError: boolean;
  isRetryingSave: boolean;
  canConfirm: boolean;
  isAdvancing: boolean;
  onRetrySave: () => void;
  onRetryUpload: () => void;
  onConfirm: () => void;
  onBack: () => void;
}

function ScorePanel({
  submission,
  moveTitle,
  hasSaveError,
  isRetryingSave,
  canConfirm,
  isAdvancing,
  onRetrySave,
  onRetryUpload,
  onConfirm,
  onBack,
}: ScorePanelProps) {
  const isTerminal = submission.kind === "scored" || submission.kind === "failed";
  return (
    <>
      <Text accessibilityRole="header" className="font-extrabold text-2xl text-foreground">
        {submission.kind === "scored" ? "Your result" : "Reviewing your dance"}
      </Text>
      {submission.kind === "scored" ? (
        <View className="gap-1">
          <Text className="font-extrabold text-4xl text-neon">{submission.score} / 100</Text>
          {moveTitle === null ? null : <Text className="text-base text-copy">{moveTitle}</Text>}
        </View>
      ) : (
        <ScanProgress submission={submission} onRetryUpload={onRetryUpload} />
      )}
      {hasSaveError ? (
        <View className="gap-2">
          <Text accessibilityLiveRegion="polite" className="text-danger text-sm">
            Couldn't save your score
          </Text>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Retry saving your score"
            accessibilityState={{ disabled: isRetryingSave }}
            disabled={isRetryingSave}
            onPress={onRetrySave}
            className="self-start rounded-xl border border-border px-4 py-2"
          >
            <Text className="font-bold text-foreground text-sm">Retry</Text>
          </BouncablePress>
        </View>
      ) : null}
      {isTerminal ? (
        <View className="gap-3">
          {canConfirm && !hasSaveError ? (
            <BouncablePress
              accessibilityRole="button"
              accessibilityLabel="Continue and Save your Score"
              accessibilityState={{ disabled: isAdvancing }}
              disabled={isAdvancing}
              onPress={onConfirm}
              className="items-center rounded-2xl bg-primary py-4"
            >
              <Text className="font-bold text-foreground">Continue and Save your Score</Text>
            </BouncablePress>
          ) : null}
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            className="items-center rounded-2xl border border-border py-4"
          >
            <Text className="font-bold text-foreground">Back</Text>
          </BouncablePress>
        </View>
      ) : null}
    </>
  );
}

/**
 * The progress copy. `deriveSubmissionState` is shared, but the package's renderer is
 * not exported and its scored branch reads "You scored 82 points!", which document 02
 * section 2 replaces with `xx / 100`.
 */
function ScanProgress({
  submission,
  onRetryUpload,
}: { submission: SubmissionState; onRetryUpload: () => void }) {
  if (submission.kind === "idle") return null;
  if (submission.kind === "uploading")
    return <Text className="text-muted text-sm">Uploading your dance…</Text>;
  if (submission.kind === "scanning")
    return (
      <View className="gap-1">
        <Text className="text-muted text-sm">Scoring your dance…</Text>
        {submission.isSlow ? (
          <Text accessibilityLiveRegion="polite" className="text-muted text-sm">
            Still scoring — you can check back here shortly.
          </Text>
        ) : null}
      </View>
    );
  if (submission.kind === "scored") return null;
  return (
    <View className="gap-2">
      <Text accessibilityLiveRegion="polite" className="text-danger text-sm">
        {submission.message}
      </Text>
      {submission.canRetry ? (
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Retry submitting your dance"
          onPress={onRetryUpload}
          className="self-start rounded-xl border border-border px-4 py-2"
        >
          <Text className="font-bold text-foreground text-sm">Retry upload</Text>
        </BouncablePress>
      ) : null}
    </View>
  );
}

function snapshotOf(move: DanceMove): LearnedMoveSnapshot {
  return {
    title: move.title,
    thumbnailUrl: move.thumbnailUrl,
    genreIds: move.genreIds,
    level: move.level,
    videoUrl: resolvePreviewMedia(move).videoUrl,
  };
}

const styles = StyleSheet.create({
  video: { flex: 1 },
});
