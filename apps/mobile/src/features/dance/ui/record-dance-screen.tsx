import { BouncablePress } from "@/components/bouncable-press";
import { MobileQueryErrorBoundary } from "@/components/error-boundary";
import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import {
  FilmStep,
  countdownCompletionMs,
  countdownPhases,
  countdownSeconds,
  delayBeforeTimerMs,
  isFilmMusicPlaying,
  musicSeekSeconds,
} from "@bnewapp/dance-core";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Camera,
  CommonResolutions,
  useCameraPermission,
  useVideoOutput,
} from "react-native-vision-camera";
import { submitDanceRecordingMutationAtom } from "../_atoms/mutations";
import { getDanceMoves } from "../api";
import { danceMoveDetailAtomFamily, danceScoreAtom } from "../_atoms/queries";
import { startDanceScorePollingAtom } from "../_atoms/effects";
import { activeDanceScanAtom, simulatedDanceRecordingEnabledAtom, useBackDanceCameraAtom } from "../_atoms/ui";
import {
  type DanceRecorder,
  chooseSimulatedDanceVideo,
  createSimulatedDanceRecorder,
  preloadSimulatedDanceVideo,
} from "../recording-adapter";
import { isScorePollingSlow } from "../score-polling";
import { CameraPermissionOverlay } from "./camera-permission-overlay";
import { DanceSkeleton } from "./dance-skeleton";
import { SubmissionFeedback } from "./submission-feedback";
import { deriveSubmissionState } from "./submission-state";

const DEFAULT_RECORDING_LENGTH_SECONDS = 60;
const VIDEO_BIT_RATE = 1_500_000;

interface RecordedClip {
  path: string;
  duration: number;
}

interface RecordDanceScreenProps {
  moveId: string;
  onBack?: () => void;
}

export function RecordDanceScreen({ moveId, onBack }: RecordDanceScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-black" edges={["top", "left", "right", "bottom"]}>
      <MobileQueryErrorBoundary title="Couldn't load this dance" retryLabel="Retry loading dance">
        <Suspense fallback={<DanceSkeleton />}>
          <RecordDanceContent moveId={moveId} onBack={onBack} />
        </Suspense>
      </MobileQueryErrorBoundary>
    </SafeAreaView>
  );
}

function RecordDanceContent({ moveId, onBack }: RecordDanceScreenProps) {
  const move = useAtomValue(danceMoveDetailAtomFamily(moveId)).data;
  const [step, setStep] = useState(FilmStep.READY);
  const [referenceOnTop, setReferenceOnTop] = useState(true);
  const [referenceDuration, setReferenceDuration] = useState<number | null>(null);
  const [recordedClip, setRecordedClip] = useState<RecordedClip | null>(null);
  const [countdownText, setCountdownText] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [simulatedVideoUrl, setSimulatedVideoUrl] = useState(move.filmYourselfVideoUrl);
  const auth = useAtomValue(queryAuthAtom);
  const simulatedRecordingToggle = useAtomValue(simulatedDanceRecordingEnabledAtom);
  const useBackCameraToggle = useAtomValue(useBackDanceCameraAtom);
  const [activeScan, setActiveScan] = useAtom(activeDanceScanAtom);
  const startScorePolling = useSetAtom(startDanceScorePollingAtom);
  const submit = useAtomValue(submitDanceRecordingMutationAtom);
  const score = useAtomValue(danceScoreAtom);
  const simulatedRecordingEnabled = __DEV__ && simulatedRecordingToggle;
  const useBackCamera = __DEV__ && useBackCameraToggle;
  const cameraPermission = useCameraPermission();
  const hasPermission = simulatedRecordingEnabled || cameraPermission.hasPermission;
  const canRequestPermission = simulatedRecordingEnabled || cameraPermission.canRequestPermission;
  const requestPermission = simulatedRecordingEnabled
    ? async () => true
    : cameraPermission.requestPermission;
  const referencePlayer = useVideoPlayer(move.filmYourselfVideoUrl, (player) => {
    player.loop = true;
    player.muted = true;
  });
  const simulatedCameraPlayer = useVideoPlayer(
    simulatedRecordingEnabled ? simulatedVideoUrl : null,
    (player) => {
      player.loop = true;
      player.muted = true;
    },
  );
  const musicPlayer = useAudioPlayer(move.music?.audioUrl);
  const videoOutput = useVideoOutput({
    enableAudio: false,
    fileType: "mp4",
    targetBitRate: VIDEO_BIT_RATE,
    targetResolution: CommonResolutions.HD_16_9,
  });
  const playersRef = useRef({ musicPlayer, referencePlayer, simulatedCameraPlayer });
  const recorderRef = useRef<DanceRecorder | null>(null);
  const stopRequestedRef = useRef(false);
  const isMountedRef = useRef(true);
  const recordingStartedAtRef = useRef<number | null>(null);
  const submittedClipRef = useRef<RecordedClip | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // One extra second of headroom so the capture never cuts the last beat off.
  const recordingLength =
    referenceDuration === null
      ? DEFAULT_RECORDING_LENGTH_SECONDS
      : Math.floor(referenceDuration) + 1;
  const countDown = countdownSeconds(move.bpm);
  const delayBeforeCountdown = delayBeforeTimerMs(
    move.music?.delayBeforeAvatarDance ?? null,
    move.bpm,
  );
  const submission = deriveSubmissionState({
    hasClip: recordedClip !== null,
    isUploading: submit.isPending,
    uploadError: submit.error ?? null,
    isScanning: activeScan !== null,
    isScorePollingSlow:
      activeScan !== null && isScorePollingSlow(activeScan.startedAt),
    score: score.data,
    scoreError: score.error ?? null,
  });

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const subscription = referencePlayer.addListener("sourceLoad", ({ duration }) => {
      if (Number.isFinite(duration) && duration > 0) setReferenceDuration(duration);
    });
    return () => subscription.remove();
  }, [referencePlayer]);

  useEffect(() => {
    if (!simulatedRecordingEnabled) return;
    void preloadSimulatedDanceVideo(simulatedVideoUrl);
  }, [simulatedRecordingEnabled, simulatedVideoUrl]);

  useEffect(() => {
    if (!simulatedRecordingEnabled || !auth) return;
    let cancelled = false;
    void getDanceMoves(auth.accessToken, { limit: 20 })
      .then((page) => {
        if (cancelled) return;
        setSimulatedVideoUrl(
          chooseSimulatedDanceVideo(
            move.filmYourselfVideoUrl,
            page.items.map((item) => item.filmYourselfVideoUrl),
          ),
        );
      })
      .catch(() => {
        // The reference clip remains a useful simulation when the catalog is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [auth, move.filmYourselfVideoUrl, simulatedRecordingEnabled]);

  // Latched so the teardown below runs only on unmount: depending on the player
  // identities directly would tear the flow down mid-countdown whenever a player
  // is recreated (expo-video rebuilds one when its source changes).
  useEffect(() => {
    playersRef.current = { musicPlayer, referencePlayer, simulatedCameraPlayer };
  }, [musicPlayer, referencePlayer, simulatedCameraPlayer]);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
    return () => {
      clearTimers();
      playersRef.current.musicPlayer.pause();
      playersRef.current.referencePlayer.pause();
      playersRef.current.simulatedCameraPlayer.pause();
      if (recorderRef.current?.isRecording) void recorderRef.current.cancelRecording();
      // The silent-mode override belongs to this screen only, and the pointer to
      // the scan must not outlive it or a stale deadline would expire instantly
      // on the next visit.
      void setAudioModeAsync({ playsInSilentMode: false });
      setActiveScan(null);
    };
  }, [clearTimers, setActiveScan]);

  useEffect(() => {
    if (isFilmMusicPlaying(step)) return;
    musicPlayer.pause();
  }, [musicPlayer, step]);

  const finishRecording = useCallback(
    (path: string) => {
      if (!isMountedRef.current) return;
      clearTimers();
      const startedAt = recordingStartedAtRef.current;
      const duration = Math.max(startedAt === null ? 0 : (Date.now() - startedAt) / 1_000, 0.1);
      recordingStartedAtRef.current = null;
      recorderRef.current = null;
      stopRequestedRef.current = false;
      referencePlayer.pause();
      referencePlayer.currentTime = 0;
      simulatedCameraPlayer.pause();
      setRecordedClip({ path: path.startsWith("file://") ? path : `file://${path}`, duration });
      setStep(FilmStep.STOP);
    },
    [clearTimers, referencePlayer, simulatedCameraPlayer],
  );

  const submitClip = useCallback(
    (clip: RecordedClip) => {
      setActiveScan(null);
      // FINISHED is the gate that stops the music: the clip is now the upload
      // flow's problem, not the camera's.
      setStep(FilmStep.FINISHED);
      submit.mutate({ danceMoveId: move.id, path: clip.path, videoLength: clip.duration });
    },
    [move.id, setActiveScan, submit.mutate],
  );

  useEffect(() => {
    if (!recordedClip || submittedClipRef.current === recordedClip) return;
    submittedClipRef.current = recordedClip;
    submitClip(recordedClip);
  }, [recordedClip, submitClip]);

  // Mirrors the queued post id into the atom the score query reads, so polling
  // survives a re-render and starts from a single source of truth.
  useEffect(() => {
    const postId = submit.data;
    if (!submit.isSuccess || postId === undefined) return;
    startScorePolling(postId);
  }, [startScorePolling, submit.data, submit.isSuccess]);

  const requestStopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (stopRequestedRef.current || !recorder?.isRecording) return;
    clearTimers();
    stopRequestedRef.current = true;
    setStep(FilmStep.STOP);
    void recorder.stopRecording().catch(() => {
      if (!isMountedRef.current) return;
      recordingStartedAtRef.current = null;
      recorderRef.current = null;
      stopRequestedRef.current = false;
      setStep(FilmStep.READY);
    });
  }, [clearTimers]);

  const beginRecording = useCallback(async () => {
    setStep(FilmStep.START_CAMERA);
    try {
      referencePlayer.pause();
      referencePlayer.currentTime = 0;
      const recorder = simulatedRecordingEnabled
        ? await createSimulatedDanceRecorder(simulatedVideoUrl, recordingLength)
        : await videoOutput.createRecorder({ maxDuration: recordingLength });
      if (!isMountedRef.current) {
        await recorder.cancelRecording();
        return;
      }
      recorderRef.current = recorder;
      stopRequestedRef.current = false;
      recordingStartedAtRef.current = Date.now();
      let didFailToStart = false;
      await recorder.startRecording(finishRecording, () => {
        if (!isMountedRef.current) return;
        didFailToStart = true;
        recordingStartedAtRef.current = null;
        recorderRef.current = null;
        stopRequestedRef.current = false;
        setRecordingError("Couldn't record your dance. Please try again.");
        setStep(FilmStep.READY);
      });
      if (!isMountedRef.current) {
        await recorder.cancelRecording();
        return;
      }
      if (didFailToStart) return;
      setStep(FilmStep.RECORDING);
      referencePlayer.play();
      if (simulatedRecordingEnabled) simulatedCameraPlayer.play();
      timersRef.current.push(setTimeout(requestStopRecording, recordingLength * 1_000));
    } catch {
      if (!isMountedRef.current) return;
      recordingStartedAtRef.current = null;
      recorderRef.current = null;
      stopRequestedRef.current = false;
      setRecordingError("Couldn't start the camera. Please try again.");
      setStep(FilmStep.READY);
    }
  }, [
    finishRecording,
    recordingLength,
    referencePlayer,
    requestStopRecording,
    simulatedCameraPlayer,
    simulatedRecordingEnabled,
    simulatedVideoUrl,
    videoOutput,
  ]);

  const startDance = useCallback(async () => {
    if (!hasPermission) {
      if (canRequestPermission) await requestPermission();
      return;
    }
    clearTimers();
    setRecordedClip(null);
    setRecordingError(null);
    setActiveScan(null);
    submit.reset();
    setStep(FilmStep.DELAY_BEFORE_AVATAR_DANCE);
    try {
      await musicPlayer.seekTo(musicSeekSeconds(move.music?.delayBeforeAvatarDance ?? null));
      musicPlayer.play();
    } catch {
      // A missing or temporarily unavailable music stream must not block recording.
    }
    timersRef.current.push(
      setTimeout(() => {
        setStep(FilmStep.TIMER);
        for (const phase of countdownPhases(countDown)) {
          timersRef.current.push(setTimeout(() => setCountdownText(phase.label), phase.afterMs));
        }
        timersRef.current.push(
          setTimeout(() => setCountdownText(null), countdownCompletionMs(countDown)),
        );
        timersRef.current.push(
          setTimeout(() => void beginRecording(), countdownCompletionMs(countDown) / 2),
        );
      }, delayBeforeCountdown),
    );
  }, [
    beginRecording,
    canRequestPermission,
    clearTimers,
    countDown,
    delayBeforeCountdown,
    hasPermission,
    move.music,
    musicPlayer,
    requestPermission,
    setActiveScan,
    submit.reset,
  ]);

  const retrySubmission = useCallback(() => {
    if (recordedClip) submitClip(recordedClip);
  }, [recordedClip, submitClip]);

  const isRecording = step === FilmStep.RECORDING;
  const isSubmissionActive = submission.kind === "uploading" || submission.kind === "scanning";
  const isStartDisabled =
    !isRecording && ((step !== FilmStep.READY && step !== FilmStep.FINISHED) || isSubmissionActive);

  return (
    <View className="flex-1 bg-black">
      <View className="flex-1 overflow-hidden bg-panel">
        {!referenceOnTop ? (
          <VideoView
            player={referencePlayer}
            contentFit="cover"
            nativeControls={false}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {hasPermission && simulatedRecordingEnabled ? (
          <VideoView
            player={simulatedCameraPlayer}
            contentFit="cover"
            nativeControls={false}
            style={referenceOnTop ? StyleSheet.absoluteFill : styles.pip}
          />
        ) : hasPermission ? (
          <Camera
            device={useBackCamera ? "back" : "front"}
            isActive={step !== FilmStep.FINISHED}
            allowBackgroundAudioPlayback
            mirrorMode="auto"
            outputs={[videoOutput]}
            constraints={[{ fps: 30 }]}
            style={referenceOnTop ? StyleSheet.absoluteFill : styles.pip}
          />
        ) : (
          <CameraPermissionOverlay
            canRequestPermission={canRequestPermission}
            onRequest={requestPermission}
          />
        )}
        {referenceOnTop ? (
          <View className="absolute right-4 top-4 h-48 w-28 overflow-hidden rounded-2xl border border-white/50 bg-black">
            <VideoView
              player={referencePlayer}
              contentFit="cover"
              nativeControls={false}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : null}
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Swap reference and camera videos"
          onPress={() => setReferenceOnTop((current) => !current)}
          className="absolute right-4 top-56 rounded-full bg-black/70 px-3 py-2"
        >
          <Text className="text-xs font-bold text-foreground">Flip PiP</Text>
        </BouncablePress>
        {countdownText ? (
          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center bg-black/20"
          >
            <Text accessibilityLiveRegion="polite" className="text-8xl font-black text-foreground">
              {countdownText}
            </Text>
          </View>
        ) : null}
      </View>
      <View className="gap-3 bg-app px-4 py-5">
        <Text accessibilityRole="header" className="text-xl font-extrabold text-foreground">
          {move.title}
        </Text>
        <Text className="text-sm text-muted">
          {step === FilmStep.RECORDING
            ? "Recording your routine…"
            : `Recording length: ${recordingLength}s`}
        </Text>
        {simulatedRecordingEnabled ? (
          <Text className="text-xs text-violet-300">
            DEV · Simulated {simulatedVideoUrl === move.filmYourselfVideoUrl ? "reference" : "catalog"} recording
          </Text>
        ) : null}
        {recordedClip ? (
          <Text className="text-sm text-neon">
            Clip ready: {recordedClip.duration.toFixed(1)} seconds
          </Text>
        ) : null}
        {recordingError ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-red-400">
            {recordingError}
          </Text>
        ) : null}
        <SubmissionFeedback submission={submission} onRetry={retrySubmission} />
        <View className="flex-row gap-3">
          {onBack ? (
            <BouncablePress
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onBack}
              className="flex-1 items-center rounded-2xl border border-border py-4"
            >
              <Text className="font-bold text-foreground">Back</Text>
            </BouncablePress>
          ) : null}
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
            accessibilityState={{ busy: isSubmissionActive }}
            onPress={isRecording ? requestStopRecording : () => void startDance()}
            disabled={isStartDisabled}
            className="flex-1 items-center rounded-2xl bg-primary py-4"
          >
            <Text className="font-bold text-foreground">
              {isRecording ? "Stop" : "Start recording"}
            </Text>
          </BouncablePress>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pip: { position: "absolute", right: 16, top: 16, width: 112, height: 192 },
});
