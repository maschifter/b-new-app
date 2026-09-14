import { BouncablePress } from "@/components/bouncable-press";
import type { DancePostHistoryItem } from "@bnewapp/types";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAtomValue } from "jotai";
import { type ReactElement, useCallback, useState } from "react";
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
}

export function DancePostGrid({ header }: DancePostGridProps) {
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
    ({ item }: { item: DancePostHistoryItem }) => <DancePostCell post={item} size={cellSize} />,
    [cellSize],
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
          tintColor="#A78BFA"
        />
      }
      ListEmptyComponent={
        query.isPending ? (
          <ActivityIndicator testID="profile-dances-loading" className="my-12" color="#A78BFA" />
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
        query.isFetchingNextPage ? <ActivityIndicator className="py-4" color="#A78BFA" /> : null
      }
    />
  );
}

function DancePostCell({ post, size }: { post: DancePostHistoryItem; size: number }) {
  const player = useVideoPlayer(post.videoUrl, (createdPlayer) => {
    createdPlayer.muted = true;
  });
  return (
    <View style={{ width: size, height: size }} className="overflow-hidden bg-panel-raised">
      <VideoView
        testID="profile-dance-video"
        player={player}
        nativeControls={false}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      {post.score !== null ? (
        <View className="absolute bottom-1 right-1 rounded-full bg-black/65 px-2 py-1">
          <Text className="text-[10px] font-extrabold text-foreground">{post.score}%</Text>
        </View>
      ) : null}
    </View>
  );
}
