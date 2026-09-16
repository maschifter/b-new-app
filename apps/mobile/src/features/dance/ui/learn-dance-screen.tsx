import { BouncablePress } from "@/components/bouncable-press";
import { MobileQueryErrorBoundary } from "@/components/error-boundary";
import { useFocusedPlayback } from "@/lib/media/use-focused-playback";
import { COLORS } from "@/lib/theme/colors";
import { DanceSkeleton } from "@bnewapp/mobile-kit/ui";
import type { DanceMove } from "@bnewapp/types";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAtom, useAtomValue } from "jotai";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { danceMoveDetailAtomFamily } from "../_atoms/queries";
import { danceVideoRateAtom } from "../_atoms/ui";

interface LearnDanceScreenProps {
  moveId: string;
  onBack?: () => void;
  onStartRecording?: () => void;
}

export function LearnDanceScreen({ moveId, onBack, onStartRecording }: LearnDanceScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-app" edges={["top", "left", "right", "bottom"]}>
      <MobileQueryErrorBoundary title="Couldn't load this dance" retryLabel="Retry loading dance">
        <Suspense fallback={<DanceSkeleton />}>
          <LearnDanceContent moveId={moveId} onBack={onBack} onStartRecording={onStartRecording} />
        </Suspense>
      </MobileQueryErrorBoundary>
    </SafeAreaView>
  );
}

function LearnDanceContent({ moveId, onBack, onStartRecording }: LearnDanceScreenProps) {
  const move = useAtomValue(danceMoveDetailAtomFamily(moveId)).data;
  const [rate, setRate] = useAtom(danceVideoRateAtom);
  const { width } = useWindowDimensions();
  const videos = useMemo(() => lessonVideos(move), [move]);
  const [videoAreaHeight, setVideoAreaHeight] = useState(0);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const onVideoAreaLayout = (event: LayoutChangeEvent) => {
    setVideoAreaHeight(event.nativeEvent.layout.height);
  };
  const onVideoPageChanged = useCallback(
    ({ nativeEvent }: { nativeEvent: { contentOffset: { x: number } } }) => {
      const pageIndex = Math.round(nativeEvent.contentOffset.x / Math.max(width, 1));
      setActiveVideoIndex(Math.min(Math.max(pageIndex, 0), videos.length - 1));
    },
    [videos.length, width],
  );

  return (
    <View className="flex-1 gap-3 pt-3">
      <View className="flex-row items-center gap-3 px-4">
        {onBack ? (
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            className="size-11 items-center justify-center rounded-full border border-border bg-panel"
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.foreground} />
          </BouncablePress>
        ) : null}
        <View className="flex-1 gap-1">
          <Text className="text-xs font-extrabold tracking-[2px] text-neon">LEARN THE ROUTINE</Text>
          <Text accessibilityRole="header" className="text-2xl font-extrabold text-foreground">
            {move.title}
          </Text>
          {move.description ? <Text className="text-sm text-muted">{move.description}</Text> : null}
        </View>
      </View>
      {videos.length > 0 ? (
        <View className="flex-1" onLayout={onVideoAreaLayout}>
          <FlatList
            horizontal
            testID="dance-lesson-videos"
            pagingEnabled
            data={videos}
            extraData={activeVideoIndex}
            keyExtractor={(video) => video.label}
            renderItem={({ item, index }) => (
              <LessonVideo
                video={item}
                width={width}
                height={videoAreaHeight}
                rate={rate}
                playing={index === activeVideoIndex}
              />
            )}
            onMomentumScrollEnd={onVideoPageChanged}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      ) : (
        <View className="mx-4 flex-1 items-center justify-center rounded-3xl border border-border bg-panel px-8">
          <Text className="text-center text-base font-bold text-foreground">
            No lesson video yet
          </Text>
          <Text className="mt-2 text-center text-sm leading-5 text-muted">
            Choose another move while this lesson is being prepared.
          </Text>
        </View>
      )}
      <PlaybackRateBar rate={rate} onChange={setRate} />
      {onStartRecording ? (
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Scan and get points"
          onPress={onStartRecording}
          className="mx-4 items-center rounded-2xl bg-primary px-5 py-4"
        >
          <Text className="font-bold text-foreground">Scan and get points</Text>
        </BouncablePress>
      ) : null}
    </View>
  );
}

interface LessonVideoSource {
  label: string;
  url: string;
}

function lessonVideos(move: DanceMove): LessonVideoSource[] {
  const candidates: Array<[string, string | null]> = [
    ["Learn", move.mainVideoUrl ?? move.filmYourselfVideoUrl],
    ["Pro dancer", move.proDancerVideoUrl],
    ["Pro tip", move.dancerTipVideoUrl],
    ["Performance", move.presentationVideoUrl],
  ];
  return candidates.flatMap(([label, url]) => (url ? [{ label, url }] : []));
}

function LessonVideo({
  video,
  width,
  height,
  rate,
  playing,
}: {
  video: LessonVideoSource;
  width: number;
  height: number;
  rate: number;
  playing: boolean;
}) {
  const player = useVideoPlayer(video.url, (createdPlayer) => {
    createdPlayer.loop = true;
    createdPlayer.muted = true;
  });
  useEffect(() => {
    player.playbackRate = rate;
  }, [player, rate]);
  useFocusedPlayback(player, playing);
  return (
    <View style={{ width, height }} className="gap-2 px-4 pb-2">
      <Text className="text-sm font-bold text-copy">{video.label}</Text>
      <View className="flex-1 overflow-hidden rounded-3xl bg-black">
        <VideoView
          player={player}
          nativeControls
          contentFit="cover"
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

function PlaybackRateBar({ rate, onChange }: { rate: number; onChange: (rate: number) => void }) {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Playback speed"
      className="flex-row justify-center gap-2 px-4"
    >
      {PLAYBACK_RATES.map((value) => {
        const selected = rate === value;
        return (
          <BouncablePress
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Set playback speed to ${value}x`}
            accessibilityState={{ selected }}
            onPress={() => onChange(value)}
            className={`rounded-full border px-4 py-2 ${selected ? "border-neon bg-neon/20" : "border-border"}`}
          >
            <Text className={selected ? "font-bold text-foreground" : "font-bold text-copy"}>
              {value}×
            </Text>
          </BouncablePress>
        );
      })}
    </View>
  );
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5];
