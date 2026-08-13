import { BouncablePress } from "@/components/bouncable-press";
import type { ExploreRoom } from "@bnewapp/types";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { exploreRoomsInfiniteAtom } from "../_atoms/queries";
import { exploreRoomsAtom } from "../_atoms/ui";
import { ExploreEmpty } from "./explore-empty";
import { ExploreSkeleton } from "./explore-skeleton";
import { RoomRow } from "./room-row";

export function ExploreScreen() {
  const query = useAtomValue(exploreRoomsInfiniteAtom);
  const rooms = useAtomValue(exploreRoomsAtom);

  const {
    data,
    isPending,
    isError,
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
  const lastPage = data?.pages.at(-1);
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
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {isPending ? (
        <ExploreSkeleton />
      ) : isError && !isFetchNextPageError && rooms.length === 0 ? (
        <ExploreError onRetry={() => refetch()} />
      ) : (
        <FlatList
          testID="explore-list"
          data={rooms}
          keyExtractor={keyExtractor}
          renderItem={renderRoom}
          contentContainerStyle={styles.content}
          ListEmptyComponent={hasNextPage || isFetchingNextPage ? null : ExploreEmpty}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ListFooter />
            ) : isFetchNextPageError ? (
              <PaginationError onRetry={loadMore} />
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
      )}
    </SafeAreaView>
  );
}

function keyExtractor(room: ExploreRoom): string {
  return room.ownerId;
}

function renderRoom({ item }: { item: ExploreRoom }) {
  return <RoomRow room={item} />;
}

function ListFooter() {
  return (
    <View testID="explore-footer" style={styles.footer}>
      <ActivityIndicator color="#8B5CF6" />
    </View>
  );
}

function PaginationError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.paginationError}>
      <Text style={styles.errorCopy}>Couldn't load more studios.</Text>
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel="Retry loading more studios"
        onPress={onRetry}
        style={styles.paginationRetry}
      >
        <Text style={styles.retryLabel}>Retry</Text>
      </BouncablePress>
    </View>
  );
}

function ExploreError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorTitle}>Couldn't load studios</Text>
      <Text style={styles.errorCopy}>Something went wrong. Please try again.</Text>
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel="Retry loading studios"
        onPress={onRetry}
        style={styles.retry}
      >
        <Text style={styles.retryLabel}>Retry</Text>
      </BouncablePress>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#101014", flex: 1 },
  content: { gap: 10, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 12 },
  footer: { paddingVertical: 20 },
  paginationError: { alignItems: "center", gap: 8, paddingVertical: 20 },
  paginationRetry: {
    borderColor: "#4A4856",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  errorBox: { alignItems: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 64 },
  errorTitle: { color: "#F8F7FC", fontSize: 18, fontWeight: "700" },
  errorCopy: { color: "#898995", fontSize: 14, lineHeight: 20, textAlign: "center" },
  retry: {
    borderColor: "#4A4856",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryLabel: { color: "#F8F7FC", fontSize: 14, fontWeight: "700" },
});
