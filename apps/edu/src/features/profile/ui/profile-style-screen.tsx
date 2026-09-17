import { useGenres } from "@/lib/catalog";
import { learnedMovesByGenreAtomFamily } from "@/lib/collection";
import { COLORS } from "@/lib/theme/colors";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import { FlatList, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LearnedMoveCard } from "./learned-move-card";

const COLUMNS = 3;
const GRID_GAP = 10;
const GRID_PADDING = 16;

interface ProfileStyleScreenProps {
  styleId: string;
  onBack: () => void;
}

/**
 * See More: every learned move in one style, same card and same order as the row it was
 * opened from. The list is local and bounded by what the user has learned, so it does not
 * page.
 */
export function ProfileStyleScreen({ styleId, onBack }: ProfileStyleScreenProps) {
  const moves = useAtomValue(learnedMovesByGenreAtomFamily(styleId));
  const { genres } = useGenres();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styleName = genres.find((genre) => genre.id === styleId)?.name ?? null;
  const cardWidth = Math.floor((width - GRID_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <SafeAreaView className="flex-1 bg-app" edges={["top", "left", "right"]}>
      <View className="flex-row items-center gap-3 px-4 py-3">
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Back to profile"
          onPress={onBack}
          className="size-11 items-center justify-center rounded-full border border-border"
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.foreground} />
        </BouncablePress>
        <Text accessibilityRole="header" className="font-extrabold text-2xl text-foreground">
          {styleName ?? "Style"}
        </Text>
      </View>
      <FlatList
        testID="style-moves-grid"
        data={moves}
        numColumns={COLUMNS}
        keyExtractor={(move) => move.moveId}
        renderItem={({ item }) => (
          <LearnedMoveCard
            move={item}
            styleName={styleName}
            width={cardWidth}
            onPress={() => router.push(`/profile/${item.moveId}`)}
          />
        )}
        columnWrapperStyle={{ gap: GRID_GAP }}
        contentContainerStyle={{
          gap: GRID_GAP,
          padding: GRID_PADDING,
          paddingBottom: insets.bottom + GRID_PADDING,
        }}
        ListEmptyComponent={
          <Text className="text-base text-muted">
            You haven't learned a move in this style yet.
          </Text>
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        windowSize={5}
      />
    </SafeAreaView>
  );
}
