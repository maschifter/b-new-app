import { type LearnedMove, learnedMovesByGenreAtomFamily } from "@/lib/collection";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import type { DanceGenre } from "@bnewapp/types";
import { useAtomValue } from "jotai";
import { FlatList, Text, View, useWindowDimensions } from "react-native";
import { EmptySlot } from "./empty-slot";
import { LearnedMoveCard } from "./learned-move-card";

/** The row keeps four slots even when fewer moves are learned, so its shape is stable. */
const ROW_SLOTS = 4;
/** Half a card is left showing, which is what makes more content to the right obvious. */
const VISIBLE_CARDS = 3.5;
const ROW_GAP = 10;
const ROW_PADDING = 16;

type RowItem = { kind: "move"; move: LearnedMove } | { kind: "empty"; key: string };

interface StyleSectionProps {
  genre: DanceGenre;
  onOpenStyle: (styleId: string) => void;
  onOpenMove: (moveId: string) => void;
}

export function StyleSection({ genre, onOpenStyle, onOpenMove }: StyleSectionProps) {
  const moves = useAtomValue(learnedMovesByGenreAtomFamily(genre.id));
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor(
    (width - ROW_PADDING * 2 - ROW_GAP * (VISIBLE_CARDS - 1)) / VISIBLE_CARDS,
  );
  const hasLearned = moves.length > 0;

  const items: RowItem[] = [
    ...moves.map((move): RowItem => ({ kind: "move", move })),
    ...Array.from(
      { length: Math.max(ROW_SLOTS - moves.length, 0) },
      (_unused, index): RowItem => ({ kind: "empty", key: `empty-${index}` }),
    ),
  ];

  return (
    <View className="gap-3 py-3">
      <View className="flex-row items-center justify-between px-4">
        <View className="flex-1 gap-0.5 pr-3">
          <Text accessibilityRole="header" className="font-extrabold text-foreground text-lg">
            {genre.name}
          </Text>
          {/* The learned count only. There is no style total to show it against. */}
          <Text className="text-muted text-sm">
            {moves.length} {moves.length === 1 ? "move" : "moves"} learned
          </Text>
        </View>
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel={`See more ${genre.name} moves`}
          accessibilityState={{ disabled: !hasLearned }}
          disabled={!hasLearned}
          onPress={() => onOpenStyle(genre.id)}
          className="min-h-11 justify-center rounded-full border border-border px-4"
        >
          <Text className={hasLearned ? "font-bold text-foreground text-sm" : "text-muted text-sm"}>
            See More
          </Text>
        </BouncablePress>
      </View>
      <FlatList
        testID={`style-row-${genre.id}`}
        horizontal
        data={items}
        keyExtractor={(item) => (item.kind === "move" ? item.move.moveId : item.key)}
        renderItem={({ item }) =>
          item.kind === "move" ? (
            <LearnedMoveCard
              move={item.move}
              styleName={genre.name}
              width={cardWidth}
              onPress={() => onOpenMove(item.move.moveId)}
            />
          ) : (
            <EmptySlot width={cardWidth} />
          )
        }
        ItemSeparatorComponent={() => <View style={{ width: ROW_GAP }} />}
        contentContainerStyle={{ paddingHorizontal: ROW_PADDING }}
        showsHorizontalScrollIndicator={false}
        removeClippedSubviews
        windowSize={3}
      />
    </View>
  );
}
