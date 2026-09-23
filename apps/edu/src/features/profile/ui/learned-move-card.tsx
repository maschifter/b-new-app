import type { LearnedMove } from "@/lib/collection";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

export const CARD_ASPECT_RATIO = 4 / 3;

interface LearnedMoveCardProps {
  move: LearnedMove;
  /**
   * Passed down by the section rather than resolved here: the style is the section the
   * card sits in, and a card has no genre list to look a name up in.
   */
  styleName: string | null;
  width: number;
  onPress: () => void;
}

/**
 * The snapshot is rendered exactly as it was captured at learn time — a move renamed or
 * unpublished since still has a card. Nothing here fetches.
 */
export function LearnedMoveCard({ move, styleName, width, onPress }: LearnedMoveCardProps) {
  const { title, thumbnailUrl, level } = move.move;
  const labelParts = [
    title,
    ...(styleName === null ? [] : [styleName]),
    `level ${level}`,
    `score ${move.savedScore}`,
  ];

  return (
    <BouncablePress
      accessibilityRole="button"
      accessibilityLabel={labelParts.join(", ")}
      onPress={onPress}
      style={{ width }}
      className="gap-2"
    >
      <View
        style={{ width, height: Math.round(width * CARD_ASPECT_RATIO) }}
        className="overflow-hidden rounded-2xl bg-panel-muted"
      >
        {thumbnailUrl === null ? null : (
          <Image source={thumbnailUrl} contentFit="cover" style={StyleSheet.absoluteFill} />
        )}
        <View className="absolute bottom-1 left-1 rounded-full bg-black/70 px-2 py-0.5">
          <Text className="font-display text-accent text-xs">{move.savedScore}</Text>
        </View>
      </View>
      <Text numberOfLines={2} className="font-semibold text-foreground text-xs">
        {title}
      </Text>
    </BouncablePress>
  );
}
