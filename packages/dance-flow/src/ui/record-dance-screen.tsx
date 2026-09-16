import {
  FilmStep,
  countdownCompletionMs,
  countdownPhases,
  countdownSeconds,
  delayBeforeTimerMs,
  isFilmMusicPlaying,
  musicSeekSeconds,
} from "@bnewapp/dance-core";
import { queryAuthAtom } from "@bnewapp/mobile-kit";
import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { BouncablePress, DanceSkeleton, MobileQueryErrorBoundary } from "@bnewapp/mobile-kit/ui";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAtomValue } from "jotai";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Camera,
  CommonResolutions,
  useCameraPermission,
  useVideoOutput,
} from "react-native-vision-camera";
import { danceMoveDetailAtomFamily } from "../_atoms/queries";
import { simulatedDanceRecordingEnabledAtom, useBackDanceCameraAtom } from "../_atoms/ui";
import { getDanceMoves } from "../api";
import {
  type DanceRecorder,
  chooseSimulatedDanceVideo,
  createSimulatedDanceRecorder,
  preloadSimulatedDanceVideo,
} from "../recording-adapter";
import { CameraPermissionOverlay } from "./camera-permission-overlay";

const DEFAULT_RECORDING_LENGTH_SECONDS = 60;
const VIDEO_BIT_RATE = 1_500_000;

export interface RecordedDanceClip {
  path: string;
  duration: number;
  /**
   * Music playhead at the first recorded frame, in milliseconds. Undefined — never 0 —
   * when the player never started, because 0 is a legitimate offset and would silently
   * mux the track from its very start instead of reaching the server's fallback.
   */
  audioOffsetMs?: number | undefined;
}

interface RecordDanceScreenProps {
  moveId: string;
  /** The explicit `| undefined` is load-bearing under `exactOptionalPropertyTypes`. */
  onBack?: (() => void) | undefined;
  onRecordingComplete: (clip: RecordedDanceClip) => void;
}

export function RecordDanceScreen({ moveId, onBack, onRecordingComplete }: RecordDanceScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-black" edges={["top", "left", "right", "bottom"]}>
      <MobileQueryErrorBoundary title="Couldn't load this dance" retryLabel="Retry loading dance">
        <Suspense fallback={<DanceSkeleton />}>
          <RecordDanceContent
            moveId={moveId}
            onBack={onBack}
            onRecordingComplete={onRecordingComplete}
          />
        </Suspense>
      </MobileQueryErrorBoundary>
    </SafeAreaView>
  );
}

function RecordDanceContent({ moveId, onBack, onRecordingComplete }: RecordDanceScreenProps) {
  const move = useAtomValue(danceMoveDetailAtomFamily(moveId)).data;
  const [step, setStep] = useState(FilmStep.READY);
  const [referenceOnTop, setReferenceOnTop] = useState(true);
  const [referenceDuration, setReferenceDuration] = useState<number | null>(null);
  const [countdownText, setCountdownText] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [simulatedVideoUrl, setSimulatedVideoUrl] = useState(move.filmYourselfVideoUrl);
  const auth = useAtomValue(queryAuthAtom);
  const simulatedRecordingToggle = useAtomValue(simulatedDanceRecordingEnabledAtom);
  const useBackCameraToggle = useAtomValue(useBackDanceCameraAtom);
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
  useFocusedPlayback(referencePlayer, step === FilmStep.RECORDING);
  useFocusedPlayback(
    simulatedCameraPlayer,
    simulatedRecordingEnabled && step === FilmStep.RECORDING,
  );
  const videoOutput = useVideoOutput({
    enableAudio: false,
    fileType: "mp4",
    targetBitRate: VIDEO_BIT_RATE,
    targetResolution: CommonResolutions.HD_16_9,
  });
  const recorderRef = useRef<DanceRecorder | null>(null);
  const stopRequestedRef = useRef(false);
  const isMountedRef = useRef(true);
  const recordingStartedAtRef = useRef<number | null>(null);
  // `finishRecording` is a useCallback closed over its own deps, so the playhead read
  // inside `beginRecording` cannot reach it by any other route.
  const audioOffsetMsRef = useRef<number | null>(null);
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

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
    return () => {
      clearTimers();
      if (recorderRef.current?.isRecording) void recorderRef.current.cancelRecording();
      void setAudioModeAsync({ playsInSilentMode: false });
    };
  }, [clearTimers]);

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
      const audioOffsetMs = audioOffsetMsRef.current;
      recordingStartedAtRef.current = null;
      audioOffsetMsRef.current = null;
      recorderRef.current = null;
      stopRequestedRef.current = false;
      musicPlayer.pause();
      referencePlayer.pause();
      referencePlayer.currentTime = 0;
      simulatedCameraPlayer.pause();
      setStep(FilmStep.FINISHED);
      onRecordingComplete({
        path: path.startsWith("file://") ? path : `file://${path}`,
        duration,
        ...(audioOffsetMs === null ? {} : { audioOffsetMs }),
      });
    },
    [clearTimers, musicPlayer, onRecordingComplete, referencePlayer, simulatedCameraPlayer],
  );

  const requestStopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (stopRequestedRef.current || !recorder?.isRecording) return;
    clearTimers();
    stopRequestedRef.current = true;
    setStep(FilmStep.STOP);
    void recorder.stopRecording().catch(() => {
      if (!isMountedRef.current) return;
      recordingStartedAtRef.current = null;
      audioOffsetMsRef.current = null;
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
        audioOffsetMsRef.current = null;
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
      // Both measurements are taken at the same instant, now that the recorder has
      // genuinely started. The pre-`await` stamp above stays as the floor — moving it
      // instead of overwriting it would let a callback fire before it is ever set, and
      // `finishRecording` floors a null start to 0.1 s.
      recordingStartedAtRef.current = Date.now();
      // The playhead is already post-seek and post-latency, so it needs no timeline
      // reconstruction. `isLoaded && playing` is the only way to tell a real 0 from a
      // player that never started: `startDance` swallows seek/play failures, and a move
      // with no music gives `useAudioPlayer` no source at all.
      audioOffsetMsRef.current =
        musicPlayer.isLoaded && musicPlayer.playing
          ? Math.round(musicPlayer.currentTime * 1_000)
          : null;
      setStep(FilmStep.RECORDING);
      referencePlayer.play();
      if (simulatedRecordingEnabled) simulatedCameraPlayer.play();
      timersRef.current.push(setTimeout(requestStopRecording, recordingLength * 1_000));
    } catch {
      if (!isMountedRef.current) return;
      recordingStartedAtRef.current = null;
      audioOffsetMsRef.current = null;
      recorderRef.current = null;
      stopRequestedRef.current = false;
      setRecordingError("Couldn't start the camera. Please try again.");
      setStep(FilmStep.READY);
    }
  }, [
    finishRecording,
    musicPlayer,
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
    setRecordingError(null);
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
  ]);

  const isRecording = step === FilmStep.RECORDING;
  const isStartDisabled = !isRecording && step !== FilmStep.READY;

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
            DEV · Simulated{" "}
            {simulatedVideoUrl === move.filmYourselfVideoUrl ? "reference" : "catalog"} recording
          </Text>
        ) : null}
        {recordingError ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-red-400">
            {recordingError}
          </Text>
        ) : null}
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
