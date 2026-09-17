import { COLORS } from "@/lib/theme/colors";
import { BouncablePress, DanceSkeleton, MobileQueryErrorBoundary } from "@bnewapp/mobile-kit/ui";
import type { DanceGenre, DanceMove } from "@bnewapp/types";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ViewToken,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { feedGenresAtom, feedMovesAtom, feedMovesInfiniteAtom } from "../_atoms/queries";
import {
  activeMoveIndexAtom,
  playbackRateAtom,
  proTipMoveIdAtom,
  resetFeedFiltersAtom,
  selectGenreAtom,
  selectLevelAtom,
  selectedGenreIdAtom,
  selectedLevelAtom,
} from "../_atoms/ui";
import { FEED_LEVELS, levelLabel } from "../data/levels";
import { FeedFilterSheet, type FilterOption } from "./feed-filter-sheet";
import { FeedMovePage } from "./feed-move-page";
import { ProTipOverlay, hasProTip } from "./pro-tip-overlay";
import { TempoBar } from "./tempo-bar";

interface FeedScreenProps {
  onOpenProfile: () => void;
}

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 80 } as const;

export function FeedScreen({ onOpenProfile }: FeedScreenProps) {
  return (
    <View className="flex-1 bg-app">
      <MobileQueryErrorBoundary title="Couldn't load the feed" retryLabel="Retry loading the feed">
        <Suspense fallback={<DanceSkeleton />}>
          <FeedContent onOpenProfile={onOpenProfile} />
        </Suspense>
      </MobileQueryErrorBoundary>
    </View>
  );
}

function FeedContent({ onOpenProfile }: FeedScreenProps) {
  const genres = useAtomValue(feedGenresAtom).data;
  const proTipMoveId = useAtomValue(proTipMoveIdAtom);

  // The filters sit outside the moves boundary on purpose: both are in that query's
  // key, so every change re-suspends it. Inside, a mis-tap could not be corrected
  // until the fetch landed, and after a failure neither Retry nor Reset filters
  // would have any filter state left to act on.
  return (
    <View className="flex-1">
      <MobileQueryErrorBoundary
        title="Couldn't load these moves"
        copy="The feed didn't load. Your filters are kept."
        retryLabel="Retry"
      >
        <Suspense fallback={<DanceSkeleton />}>
          <FeedPager onOpenProfile={onOpenProfile} />
        </Suspense>
      </MobileQueryErrorBoundary>
      {/* The bar hides behind the Pro Tip overlay, which renders inside the boundary
          above. `FeedPager` clears the id whenever that overlay is not on the screen,
          so this cannot hide the bar with nothing in its place. */}
      {proTipMoveId === null ? <FeedFilterBar genres={genres} /> : null}
    </View>
  );
}

function FeedFilterBar({ genres }: { genres: DanceGenre[] }) {
  const level = useAtomValue(selectedLevelAtom);
  const genreId = useAtomValue(selectedGenreIdAtom);
  const selectLevel = useSetAtom(selectLevelAtom);
  const selectGenre = useSetAtom(selectGenreAtom);
  const [openSheet, setOpenSheet] = useState<"level" | "style" | null>(null);

  const styleLabel =
    genreId === null
      ? "All Styles"
      : (genres.find((genre) => genre.id === genreId)?.name ?? "All Styles");
  const levelOptions: Array<FilterOption<number>> = [
    { value: null, label: "All Levels" },
    ...FEED_LEVELS.map((value) => ({ value, label: levelLabel(value) })),
  ];
  // Rendered in the order the server returned. The agreed order lives in
  // `dance_genres.sort_order`, which is admin data, not client code.
  const styleOptions: Array<FilterOption<string>> = [
    { value: null, label: "All Styles" },
    ...genres.map((genre) => ({ value: genre.id, label: genre.name })),
  ];

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0"
    >
      <View pointerEvents="box-none" className="flex-row gap-2 px-4 pt-2">
        <FilterButton
          label={levelLabel(level)}
          accessibilityLabel={`Level filter, ${levelLabel(level)}`}
          onPress={() => setOpenSheet("level")}
        />
        <FilterButton
          label={styleLabel}
          accessibilityLabel={`Style filter, ${styleLabel}`}
          onPress={() => setOpenSheet("style")}
        />
      </View>
      <FeedFilterSheet
        visible={openSheet === "level"}
        title="Level"
        options={levelOptions}
        selected={level}
        onSelect={selectLevel}
        onClose={() => setOpenSheet(null)}
      />
      <FeedFilterSheet
        visible={openSheet === "style"}
        title="Style"
        options={styleOptions}
        selected={genreId}
        onSelect={selectGenre}
        onClose={() => setOpenSheet(null)}
      />
    </SafeAreaView>
  );
}

function FilterButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <BouncablePress
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="flex-row items-center gap-1 rounded-full border border-white/20 bg-black/40 px-4 py-2"
    >
      <Text className="font-bold text-foreground text-sm">{label}</Text>
      <Ionicons name="chevron-down" size={14} color={COLORS.foreground} />
    </BouncablePress>
  );
}

function FeedPager({ onOpenProfile }: FeedScreenProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const moves = useAtomValue(feedMovesAtom);
  const query = useAtomValue(feedMovesInfiniteAtom);
  const activeIndex = useAtomValue(activeMoveIndexAtom);
  const setActiveIndex = useSetAtom(activeMoveIndexAtom);
  const setPlaybackRate = useSetAtom(playbackRateAtom);
  const resetFilters = useSetAtom(resetFeedFiltersAtom);
  const [proTipMoveId, setProTipMoveId] = useAtom(proTipMoveIdAtom);
  const genreId = useAtomValue(selectedGenreIdAtom);
  const level = useAtomValue(selectedLevelAtom);
  const [tempoDragging, setTempoDragging] = useState(false);
  // Created once: a new instance each render would carry a new handler tag and leave
  // the tempo bar blocking a handler that no longer exists.
  const pagerGesture = useMemo(() => Gesture.Native().withTestId("feed-pager-native"), []);

  const viewabilityPairs = useRef([
    {
      viewabilityConfig: VIEWABILITY_CONFIG,
      onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const first = viewableItems[0];
        if (first?.index === null || first?.index === undefined) return;
        setActiveIndex(first.index);
        // Document 01 line 47. Done here rather than in the tempo control so it
        // holds for a swipe as much as for a Pro Tip dismissal.
        setPlaybackRate(1);
      },
    },
  ]).current;

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);

  const renderMove = useCallback(
    ({ item, index }: { item: DanceMove; index: number }) => (
      <FeedMovePage move={item} active={index === activeIndex} width={width} height={height} />
    ),
    [activeIndex, height, width],
  );

  const proTipMove =
    proTipMoveId === null ? null : (moves.find((move) => move.id === proTipMoveId) ?? null);

  // The open id is also what hides the filter bar, one boundary up. An id that no
  // longer resolves — the move dropped out of a refetched page — would hide the bar
  // with no overlay to replace it, so the id follows the move.
  useEffect(() => {
    if (proTipMoveId !== null && proTipMove === null) setProTipMoveId(null);
  }, [proTipMove, proTipMoveId, setProTipMoveId]);

  // The overlay lives in this subtree, so anything that takes the subtree away — a
  // failed reload swapping in the error boundary, a filter change re-suspending it —
  // takes the overlay with it and leaves the id stale. The position goes back with it:
  // the next pager builds its list at offset 0, and an index left on the old position
  // would caption and open a move that is not the one on the screen.
  useEffect(
    () => () => {
      setProTipMoveId(null);
      setActiveIndex(0);
      setPlaybackRate(1);
    },
    [setActiveIndex, setPlaybackRate, setProTipMoveId],
  );

  if (moves.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-4 px-10">
        <Text accessibilityRole="header" className="font-extrabold text-foreground text-xl">
          No moves found
        </Text>
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Reset filters"
          onPress={resetFilters}
          className="rounded-full bg-primary px-6 py-3"
        >
          <Text className="font-bold text-base text-foreground">Reset filters</Text>
        </BouncablePress>
      </View>
    );
  }

  const activeMove = moves[activeIndex] ?? moves[0] ?? null;

  return (
    <View className="flex-1">
      <GestureDetector gesture={pagerGesture}>
        <FlatList
          // A filter change is a new query key, so the list underneath is replaced
          // wholesale. Remounting is what puts the offset back at the top with the
          // index, instead of leaving a new result set scrolled to an old position.
          key={`${genreId ?? "all"}:${level ?? "all"}`}
          testID="feed-pager"
          data={moves}
          keyExtractor={(move) => move.id}
          renderItem={renderMove}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          scrollEnabled={!tempoDragging}
          getItemLayout={(_data, index) => ({ length: height, offset: height * index, index })}
          viewabilityConfigCallbackPairs={viewabilityPairs}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          // Every page owns a video player, so the window stays small. Clipping is a
          // device-verified toggle on a full-screen vertical pager, not a default.
          windowSize={3}
          refreshControl={
            <RefreshControl
              testID="feed-refresh-control"
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              onRefresh={() => void query.refetch()}
              tintColor={COLORS.neon}
            />
          }
        />
      </GestureDetector>
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        locations={[0, 0.9]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: Math.round(height * 0.32),
        }}
      />
      {/* Not a `SafeAreaView`: every child below is absolutely positioned, and an
          absolute child is laid out against the border box, so the padding a
          `SafeAreaView` adds for an inset never reaches it. The device's system bars
          overlay this screen, so each child carries the inset it needs itself. The
          app is portrait-locked, which leaves only the bottom one to carry. */}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View pointerEvents="box-none" className="absolute right-3 top-16 items-end gap-3">
          <ActionButton icon="person-circle-outline" label="Open profile" onPress={onOpenProfile} />
          {activeMove && hasProTip(activeMove) ? (
            <ActionButton
              icon="bulb-outline"
              label="Open Pro Tip"
              onPress={() => setProTipMoveId(activeMove.id)}
            />
          ) : null}
        </View>
        <View
          pointerEvents="box-none"
          className="absolute right-3"
          style={{ bottom: insets.bottom + 150 }}
        >
          <TempoBar
            height={Math.round(height * 0.36)}
            pagerGesture={pagerGesture}
            onDragChange={setTempoDragging}
          />
        </View>
        <View
          testID="feed-actions"
          pointerEvents="box-none"
          className="absolute inset-x-0 bottom-0 gap-3 px-5"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          {query.isFetchingNextPage ? (
            <ActivityIndicator testID="feed-pagination-spinner" color={COLORS.neon} />
          ) : null}
          <Text className="max-w-[60%] font-extrabold text-2xl text-foreground" numberOfLines={2}>
            {activeMove?.title ?? ""}
          </Text>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel={
              activeMove ? `Dance this Move, ${activeMove.title}` : "Dance this Move"
            }
            disabled={activeMove === null}
            onPress={() => {
              if (activeMove) router.push(`/move/${activeMove.id}/scan`);
            }}
            className="items-center justify-center rounded-full bg-primary px-6 py-4"
          >
            <Text className="font-bold text-base text-foreground">Dance this Move</Text>
          </BouncablePress>
        </View>
      </View>
      {proTipMove ? (
        <ProTipOverlay move={proTipMove} onClose={() => setProTipMoveId(null)} />
      ) : null}
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <BouncablePress
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="size-12 items-center justify-center rounded-full border border-white/20 bg-black/40"
    >
      <Ionicons name={icon} size={24} color={COLORS.foreground} />
    </BouncablePress>
  );
}
