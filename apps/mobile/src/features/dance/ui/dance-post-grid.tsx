import { COLORS } from "@bnewapp/mobile-kit/theme/colors";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import type { DancePostHistoryItem } from "@bnewapp/types";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAtomValue } from "jotai";
import { type ReactElement, type ReactNode, useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { dancePostsAtom, dancePostsInfiniteAtom } from "../_atoms/queries";

const GRID_GAP = 2;

interface DancePostGridProps {
  header?: ReactElement;
  onOpenPost?: (postId: string) => void;
}

export function DancePostGrid({ header, onOpenPost }: DancePostGridProps) {
  const [gridWidth, setGridWidth] = useState(0);
  const posts = useAtomValue(dancePostsAtom);
  const query = useAtomValue(dancePostsInfiniteAtom);
  const cellSize = Math.floor((gridWidth - GRID_GAP * 2) / 3);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setGridWidth(event.nativeEvent.layout.width);
  }, []);
  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);
  const renderItem = useCallback(
    ({ item }: { item: DancePostHistoryItem }) => (
      <DancePostCell post={item} size={cellSize} onPress={onOpenPost} />
    ),
    [cellSize, onOpenPost],
  );

  return (
    <FlatList
      testID="profile-dance-grid"
      className="flex-1"
      data={query.isPending || query.isError ? [] : posts}
      numColumns={3}
      keyExtractor={(post) => post.id}
      renderItem={renderItem}
      columnWrapperStyle={{ gap: GRID_GAP }}
      contentContainerStyle={{ gap: GRID_GAP, paddingBottom: 24, flexGrow: 1 }}
      ListHeaderComponent={header}
      onLayout={handleLayout}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      removeClippedSubviews
      windowSize={5}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={COLORS.neon}
        />
      }
      ListEmptyComponent={
        query.isPending ? (
          <ActivityIndicator
            testID="profile-dances-loading"
            className="my-12"
            color={COLORS.neon}
          />
        ) : query.isError ? (
          <View className="items-center gap-3 px-8 py-12">
            <Text accessibilityRole="alert" className="text-center text-sm text-muted">
              Couldn&apos;t load your dances.
            </Text>
            <BouncablePress
              accessibilityRole="button"
              accessibilityLabel="Retry loading your dances"
              onPress={() => void query.refetch()}
              className="rounded-full border border-border px-4 py-2"
            >
              <Text className="text-sm font-bold text-foreground">Retry</Text>
            </BouncablePress>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center gap-2 px-8 py-16">
            <Text className="text-lg font-extrabold text-foreground">No dances yet</Text>
            <Text className="text-center text-sm leading-5 text-muted">
              Your recorded dances will appear here.
            </Text>
          </View>
        )
      }
      ListFooterComponent={
        query.isFetchingNextPage ? <ActivityIndicator className="py-4" color={COLORS.neon} /> : null
      }
    />
  );
}

interface DancePostCellProps {
  post: DancePostHistoryItem;
  size: number;
  onPress?: (postId: string) => void;
}

/**
 * Two sibling cells rather than one component with a branch: `useVideoPlayer` is a hook
 * and cannot be called conditionally. Once the media job lands, the poster cell replaces a
 * mounted video player per grid cell, which is the point of the whole poster pipeline.
 */
function DancePostCell(props: DancePostCellProps) {
  return props.post.thumbnailUrl === null ? (
    <DanceVideoCell {...props} />
  ) : (
    <DancePosterCell {...props} thumbnailUrl={props.post.thumbnailUrl} />
  );
}

function DancePostCellShell({
  post,
  size,
  onPress,
  children,
}: DancePostCellProps & { children: ReactNode }) {
  return (
    <BouncablePress
      accessibilityRole="button"
      accessibilityLabel="Open recorded dance"
      onPress={onPress ? () => onPress(post.id) : undefined}
      disabled={!onPress}
      style={{ width: size, height: size }}
      className="overflow-hidden bg-panel-raised"
    >
      {children}
      {post.score !== null ? (
        <View className="absolute bottom-1 right-1 rounded-full bg-black/65 px-2 py-1">
          <Text className="text-[10px] font-extrabold text-foreground">{post.score}%</Text>
        </View>
      ) : null}
    </BouncablePress>
  );
}

function DancePosterCell({
  thumbnailUrl,
  ...props
}: DancePostCellProps & { thumbnailUrl: string }) {
  const { post } = props;
  return (
    <DancePostCellShell {...props}>
      <Image
        testID="profile-dance-poster"
        // The bucket is private, so every refetch mints a fresh signed URL for the same
        // object. expo-image caches by URI, so without `cacheKey` pinned to the stable
        // storage path the poster is re-downloaded on every pull-to-refresh and remount.
        source={{
          uri: thumbnailUrl,
          ...(post.thumbnailPath === null ? {} : { cacheKey: post.thumbnailPath }),
        }}
        {...(post.blurhash === null ? {} : { placeholder: { blurhash: post.blurhash } })}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
    </DancePostCellShell>
  );
}

/** Fallback until the media job produces a poster: today's behaviour. */
function DanceVideoCell(props: DancePostCellProps) {
  const player = useVideoPlayer(props.post.videoUrl, (createdPlayer) => {
    createdPlayer.muted = true;
  });
  return (
    <DancePostCellShell {...props}>
      <VideoView
        testID="profile-dance-video"
        player={player}
        nativeControls={false}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
    </DancePostCellShell>
  );
}
