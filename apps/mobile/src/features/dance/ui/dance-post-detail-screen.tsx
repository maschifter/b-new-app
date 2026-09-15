import { AppHeader } from "@/components/app-header";
import { MobileQueryErrorBoundary } from "@/components/error-boundary";
import { useFocusedPlayback } from "@/lib/media/use-focused-playback";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAtomValue } from "jotai";
import { Suspense, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { dancePostDetailAtomFamily } from "../_atoms/queries";

interface DancePostDetailScreenProps {
  postId: string;
  onBack: () => void;
}

export function DancePostDetailScreen({ postId, onBack }: DancePostDetailScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-app" edges={["top", "left", "right", "bottom"]}>
      <MobileQueryErrorBoundary
        title="Couldn't load this recorded dance"
        retryLabel="Retry loading dance"
      >
        <Suspense fallback={<DancePostDetailSkeleton onBack={onBack} />}>
          <DancePostDetailContent postId={postId} onBack={onBack} />
        </Suspense>
      </MobileQueryErrorBoundary>
    </SafeAreaView>
  );
}

function DancePostDetailContent({ postId, onBack }: DancePostDetailScreenProps) {
  const post = useAtomValue(dancePostDetailAtomFamily(postId)).data;
  // The merged file carries the music; the original silent recording is what plays until
  // the media job lands, and stays the fallback if it never does.
  const player = useVideoPlayer(post.mergedVideoUrl ?? post.videoUrl);
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  useFocusedPlayback(player, true);
  // VideoView has no poster or placeholder prop, so the poster is an overlay dismissed on
  // the first decoded frame rather than something the player owns.
  const showPoster = !hasFirstFrame && post.thumbnailUrl !== null;

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 pb-8 pt-3">
      <AppHeader title="DANCE DETAIL" onBack={onBack} />
      <View className="aspect-[9/16] overflow-hidden rounded-3xl bg-black">
        <VideoView
          testID="dance-post-detail-video"
          player={player}
          nativeControls
          contentFit="contain"
          onFirstFrameRender={() => setHasFirstFrame(true)}
          style={StyleSheet.absoluteFill}
        />
        {showPoster && post.thumbnailUrl !== null ? (
          <Image
            testID="dance-post-detail-poster"
            pointerEvents="none"
            source={{
              uri: post.thumbnailUrl,
              ...(post.thumbnailPath === null ? {} : { cacheKey: post.thumbnailPath }),
            }}
            {...(post.blurhash === null ? {} : { placeholder: { blurhash: post.blurhash } })}
            contentFit="contain"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </View>
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-2xl font-extrabold text-foreground">
          {post.danceMove.title}
        </Text>
        {post.danceMove.description ? (
          <Text className="text-base leading-6 text-copy">{post.danceMove.description}</Text>
        ) : null}
      </View>
      <View className="flex-row gap-3">
        <DetailStat label="Score" value={post.score === null ? "Pending" : `${post.score}%`} />
        <DetailStat label="Status" value={formatStatus(post.status)} />
        <DetailStat label="Duration" value={formatDuration(post.videoLengthS)} />
      </View>
      <View className="rounded-2xl border border-border bg-panel p-4">
        <Text className="text-xs font-extrabold tracking-[1.5px] text-neon">RECORDED</Text>
        <Text className="mt-1 text-base font-bold text-foreground">
          {formatRecordedAt(post.createdAt)}
        </Text>
        {post.danceMove.music ? (
          <Text className="mt-1 text-sm text-muted">
            {post.danceMove.music.artist
              ? `${post.danceMove.music.title} · ${post.danceMove.music.artist}`
              : post.danceMove.music.title}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function DancePostDetailSkeleton({ onBack }: Pick<DancePostDetailScreenProps, "onBack">) {
  return (
    <View className="flex-1 gap-6 px-4 pt-3">
      <AppHeader title="DANCE DETAIL" onBack={onBack} />
      <View className="aspect-[9/16] rounded-3xl bg-panel-raised" />
      <View className="h-8 w-2/3 rounded bg-panel-raised" />
      <View className="h-5 w-full rounded bg-panel-raised" />
    </View>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-panel p-3">
      <Text className="text-[11px] font-extrabold tracking-[1px] text-muted">
        {label.toUpperCase()}
      </Text>
      <Text className="mt-1 text-sm font-bold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function formatRecordedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
