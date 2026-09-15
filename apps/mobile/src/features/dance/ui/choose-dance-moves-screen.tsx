import { BouncablePress } from "@/components/bouncable-press";
import { MobileQueryErrorBoundary } from "@/components/error-boundary";
import type { DanceGenre, DanceMove } from "@bnewapp/types";
import { Ionicons } from "@expo/vector-icons";
import { useAtom, useAtomValue } from "jotai";
import { Suspense, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { danceGenresAtom, danceMovesAtom, danceMovesInfiniteAtom } from "../_atoms/queries";
import { selectedDanceGenreIdAtom, selectedDanceMoveIdAtom } from "../_atoms/ui";
import { DanceMoveCard } from "./dance-move-card";
import { DanceSkeleton } from "./dance-skeleton";

interface ChooseDanceMovesScreenProps {
  onOpenMove: (moveId: string) => void;
  onBack?: () => void;
}

const MOVE_CARD_ASPECT = 0.72;
const MOVE_CARD_GAP = 16;

function useMoveCardMetrics() {
  const { width, height } = useWindowDimensions();
  let cardWidth = Math.round(width * 0.84);
  let cardHeight = Math.round(cardWidth / MOVE_CARD_ASPECT);
  const maxHeight = Math.round(height * 0.6);
  if (cardHeight > maxHeight) {
    cardHeight = maxHeight;
    cardWidth = Math.round(cardHeight * MOVE_CARD_ASPECT);
  }
  return { cardWidth, cardHeight, stride: cardWidth + MOVE_CARD_GAP };
}

export function ChooseDanceMovesScreen({ onOpenMove, onBack }: ChooseDanceMovesScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-app" edges={["top", "left", "right", "bottom"]}>
      <MobileQueryErrorBoundary title="Couldn't load dances" retryLabel="Retry loading dances">
        <Suspense fallback={<DanceSkeleton />}>
          <ChooseDanceMovesContent onOpenMove={onOpenMove} onBack={onBack} />
        </Suspense>
      </MobileQueryErrorBoundary>
    </SafeAreaView>
  );
}

function ChooseDanceMovesContent({ onOpenMove, onBack }: ChooseDanceMovesScreenProps) {
  const { cardWidth, cardHeight, stride } = useMoveCardMetrics();
  const genres = useAtomValue(danceGenresAtom).data;
  const moves = useAtomValue(danceMovesAtom);
  const query = useAtomValue(danceMovesInfiniteAtom);
  const [genreId, setGenreId] = useAtom(selectedDanceGenreIdAtom);
  const [selectedMoveId, setSelectedMoveId] = useAtom(selectedDanceMoveIdAtom);
  const movesListRef = useRef<FlatList<DanceMove>>(null);

  useEffect(() => {
    if (moves.some((move) => move.id === selectedMoveId)) return;
    setSelectedMoveId(moves[0]?.id ?? null);
  }, [moves, selectedMoveId, setSelectedMoveId]);

  const selectedMove = moves.find((move) => move.id === selectedMoveId) ?? null;
  const lastPage = query.data.pages.at(-1);
  useEffect(() => {
    if (
      lastPage?.items.length === 0 &&
      query.hasNextPage &&
      !query.isFetchingNextPage &&
      !query.isFetchNextPageError
    ) {
      void query.fetchNextPage();
    }
  }, [
    lastPage,
    query.fetchNextPage,
    query.hasNextPage,
    query.isFetchingNextPage,
    query.isFetchNextPageError,
  ]);

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);
  const renderMove = useCallback(
    ({ item }: { item: DanceMove }) => (
      <DanceMoveCard
        move={item}
        selected={item.id === selectedMoveId}
        width={cardWidth}
        height={cardHeight}
        onPress={() => setSelectedMoveId(item.id)}
      />
    ),
    [cardHeight, cardWidth, selectedMoveId, setSelectedMoveId],
  );
  const selectMoveAtScrollOffset = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(nativeEvent.contentOffset.x / stride);
      const move = moves[index];
      if (move) setSelectedMoveId(move.id);
    },
    [moves, setSelectedMoveId, stride],
  );
  const shuffle = useCallback(() => {
    if (moves.length === 0) return;
    const alternatives = moves.filter((move) => move.id !== selectedMoveId);
    const choices = alternatives.length > 0 ? alternatives : moves;
    const selectedMove = choices[Math.floor(Math.random() * choices.length)];
    if (!selectedMove) return;

    setSelectedMoveId(selectedMove.id);
    movesListRef.current?.scrollToIndex({ index: moves.indexOf(selectedMove), animated: true });
  }, [moves, selectedMoveId, setSelectedMoveId]);

  return (
    <View className="flex-1">
      <View className="gap-3 px-4 pb-1 pt-2">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 flex-row items-center gap-3">
            {onBack ? (
              <BouncablePress
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={onBack}
                className="size-11 items-center justify-center rounded-full border border-border bg-panel"
              >
                <Ionicons name="chevron-back" size={22} color="#F8F7FC" />
              </BouncablePress>
            ) : null}
            <View className="flex-1">
              <Text className="text-xs font-extrabold tracking-[2px] text-neon">DANCE LIBRARY</Text>
              <Text
                accessibilityRole="header"
                className="mt-1 text-2xl font-extrabold text-foreground"
              >
                Choose your next move
              </Text>
            </View>
          </View>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Refresh dance moves"
            onPress={() => void query.refetch()}
            disabled={query.isRefetching}
            className="rounded-full border border-border bg-panel px-3 py-2"
          >
            <Text className="text-xs font-bold text-copy">Refresh</Text>
          </BouncablePress>
        </View>
        <GenreSelector genres={genres} selectedGenreId={genreId} onSelect={setGenreId} />
      </View>
      <View
        className={`flex-1 justify-center ${
          query.isFetching && !query.isFetchingNextPage ? "opacity-60" : ""
        }`}
      >
        <FlatList
          ref={movesListRef}
          testID="dance-moves-list"
          style={{ flexGrow: 0 }}
          horizontal
          data={moves}
          keyExtractor={(move) => move.id}
          renderItem={renderMove}
          getItemLayout={(_data, index) => ({ length: stride, offset: stride * index, index })}
          contentContainerStyle={{
            alignItems: "center",
            gap: MOVE_CARD_GAP,
            paddingHorizontal: 24,
          }}
          showsHorizontalScrollIndicator={false}
          snapToInterval={stride}
          snapToAlignment="start"
          decelerationRate="fast"
          alwaysBounceVertical
          onMomentumScrollEnd={selectMoveAtScrollOffset}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          removeClippedSubviews
          windowSize={3}
          refreshControl={
            <RefreshControl
              testID="dance-moves-refresh-control"
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              onRefresh={() => void query.refetch()}
              tintColor="#A78BFA"
            />
          }
          ListEmptyComponent={
            query.hasNextPage || query.isFetchingNextPage ? null : (
              <View style={{ width: cardWidth }} className="items-center py-16">
                <Text className="text-center text-base text-muted">
                  No dances in this genre yet.
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <View testID="dance-list-footer" className="w-16 items-center justify-center">
                <ActivityIndicator color="#A78BFA" />
              </View>
            ) : query.isFetchNextPageError ? (
              <BouncablePress
                accessibilityRole="button"
                accessibilityLabel="Retry loading more dance moves"
                onPress={loadMore}
                className="w-36 items-center justify-center rounded-2xl border border-border bg-panel px-3 py-4"
              >
                <Text className="text-center text-xs font-bold text-copy">
                  Load more failed. Retry
                </Text>
              </BouncablePress>
            ) : null
          }
        />
      </View>
      <View className="flex-row gap-3 px-4 pb-2 pt-2">
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Shuffle dance moves"
          onPress={shuffle}
          disabled={moves.length === 0}
          className="items-center justify-center rounded-full border border-border bg-panel px-6 py-4"
        >
          <Text className="font-bold text-copy">Shuffle</Text>
        </BouncablePress>
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel={selectedMove ? `Learn ${selectedMove.title}` : "Choose a dance"}
          onPress={() => selectedMove && onOpenMove(selectedMove.id)}
          disabled={!selectedMove}
          className="flex-1 items-center justify-center rounded-full bg-primary px-5 py-4"
        >
          <Text className="text-base font-bold text-foreground">Choose this move</Text>
        </BouncablePress>
      </View>
    </View>
  );
}

function GenreSelector({
  genres,
  selectedGenreId,
  onSelect,
}: {
  genres: DanceGenre[];
  selectedGenreId: string | null;
  onSelect: (genreId: string | null) => void;
}) {
  const values: Array<DanceGenre | null> = [null, ...genres];
  return (
    <FlatList
      className="flex-grow-0"
      horizontal
      data={values}
      keyExtractor={(genre) => genre?.id ?? "all"}
      contentContainerClassName="items-center gap-2 pr-4"
      showsHorizontalScrollIndicator={false}
      renderItem={({ item }) => {
        const active = selectedGenreId === (item?.id ?? null);
        const label = item?.name ?? "All";
        return (
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${label}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item?.id ?? null)}
            className={`self-center rounded-full border px-4 py-2 ${active ? "border-neon bg-neon" : "border-border bg-panel"}`}
          >
            <Text className={`text-sm font-bold ${active ? "text-app" : "text-copy"}`}>
              {label}
            </Text>
          </BouncablePress>
        );
      }}
    />
  );
}
