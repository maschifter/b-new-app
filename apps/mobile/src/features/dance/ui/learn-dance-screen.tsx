import { danceMoveDetailAtomFamily } from "@bnewapp/dance-flow/atoms";
import { useFocusedPlayback } from "@bnewapp/mobile-kit/media/use-focused-playback";
import { COLORS } from "@bnewapp/mobile-kit/theme/colors";
import { BouncablePress, DanceSkeleton, MobileQueryErrorBoundary } from "@bnewapp/mobile-kit/ui";
import { TempoBar } from "@bnewapp/mobile-kit/ui/tempo-bar";
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { danceVideoRateAtom } from "../_atoms/ui";

interface LearnDanceScreenProps {
  moveId: string;
  onBack?: () => void;
  onStartRecording?: () => void;
}

/**
 * The column the tempo bar is laid into. The player keeps its own native controls, so the
 * bar sits beside it rather than over it: a control cluster under the bar's pan area would
 * be unreachable while the controls overlay is up. Every lesson page reserves this much on
 * its right, and the bar is centred in what it leaves.
 */
const TEMPO_GUTTER = 64;

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
  const [tempoDragging, setTempoDragging] = useState(false);
  // Created once: a new instance each render would carry a new handler tag and leave
  // the tempo bar blocking a handler that no longer exists.
  const pagerGesture = useMemo(() => Gesture.Native().withTestId("dance-lesson-pager"), []);
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
        <View testID="dance-lesson-stage" className="flex-1" onLayout={onVideoAreaLayout}>
          <GestureDetector gesture={pagerGesture}>
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
              scrollEnabled={!tempoDragging}
              onMomentumScrollEnd={onVideoPageChanged}
              showsHorizontalScrollIndicator={false}
            />
          </GestureDetector>
          {videoAreaHeight > 0 ? (
            <View
              testID="dance-tempo-gutter"
              pointerEvents="box-none"
              className="absolute right-0 items-center"
              style={{ width: TEMPO_GUTTER, bottom: Math.round(videoAreaHeight * 0.22) }}
            >
              <TempoBar
                height={Math.round(videoAreaHeight * 0.45)}
                rate={rate}
                onRateChange={setRate}
                pagerGesture={pagerGesture}
                pagerAxis="horizontal"
                onDragChange={setTempoDragging}
                showValueAtRest
              />
            </View>
          ) : null}
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
    <View
      testID="dance-lesson-page"
      // The page stays the full window width so a sideways swipe pages from anywhere,
      // including the gutter; only the player inside it gives the column up.
      style={{ width, height, paddingRight: TEMPO_GUTTER }}
      className="gap-2 pl-4 pb-2"
    >
      <Text className="text-sm font-bold text-copy">{video.label}</Text>
      <View className="flex-1 overflow-hidden rounded-3xl bg-black">
        <VideoView
          testID="dance-lesson-video"
          player={player}
          nativeControls
          contentFit="cover"
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}
