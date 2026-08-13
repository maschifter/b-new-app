import { MobileQueryErrorBoundary } from "@/components/error-boundary";
import type { ExploreRoom } from "@bnewapp/types";
import { useAtomValue } from "jotai";
import { Suspense, useEffect } from "react";
import { FlatList, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { exploreRoomsInfiniteAtom } from "../_atoms/queries";
import { exploreRoomsAtom } from "../_atoms/ui";
import { ExploreEmpty } from "./explore-empty";
import { ExploreListFooter, ExplorePaginationError } from "./explore-list-feedback";
import { ExploreSkeleton } from "./explore-skeleton";
import { RoomRow } from "./room-row";

export function ExploreScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <MobileQueryErrorBoundary
        title="Couldn't load studios"
        retryLabel="Retry loading studios"
      >
        <Suspense fallback={<ExploreSkeleton />}>
          <ExploreContent />
        </Suspense>
      </MobileQueryErrorBoundary>
    </SafeAreaView>
  );
}

function ExploreContent() {
  const query = useAtomValue(exploreRoomsInfiniteAtom);
  const rooms = useAtomValue(exploreRoomsAtom);

  const {
    data,
    isRefetching,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    refetch,
  } = query;

  // A raw page can reconcile down to zero items while its cursor still points at
  // valid later rows. When the most recent page is empty but has a next cursor,
  // advance exactly one guarded page. Keyed on the last page object, so the same
  // render can't relaunch it; each new empty page triggers the next hop until a
  // page contributes items or its cursor is null.
  const lastPage = data.pages.at(-1);
  useEffect(() => {
    if (!lastPage) return;
    if (
      lastPage.items.length === 0 &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchNextPageError
    ) {
      void fetchNextPage();
    }
  }, [lastPage, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  };

  return (
    <FlatList
      testID="explore-list"
      data={rooms}
      keyExtractor={keyExtractor}
      renderItem={renderRoom}
      contentContainerStyle={styles.content}
      ListEmptyComponent={hasNextPage || isFetchingNextPage ? null : ExploreEmpty}
      ListFooterComponent={
        isFetchingNextPage ? (
          <ExploreListFooter />
        ) : isFetchNextPageError ? (
          <ExplorePaginationError onRetry={loadMore} />
        ) : null
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      removeClippedSubviews
      windowSize={5}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching && !isFetchingNextPage}
          onRefresh={() => refetch()}
          tintColor="#8B5CF6"
        />
      }
    />
  );
}

function keyExtractor(room: ExploreRoom): string {
  return room.ownerId;
}

function renderRoom({ item }: { item: ExploreRoom }) {
  return <RoomRow room={item} />;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#101014", flex: 1 },
  content: { gap: 10, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 12 },
});
