import { useGenres } from "@/lib/catalog";
import { COLORS } from "@/lib/theme/colors";
import { BouncablePress, DanceSkeleton } from "@bnewapp/mobile-kit/ui";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ProfileSummary } from "./profile-summary";
import { StyleSection } from "./style-section";

interface ProfileScreenProps {
  onBack: () => void;
}

/**
 * Everything on this screen is local except the style names, so it renders offline. The
 * sections are a `ScrollView` rather than a `FlatList`: there is one per genre, and the
 * genre list is small and fixed — a sectioned list would only add gesture risk under the
 * horizontal rows.
 */
export function ProfileScreen({ onBack }: ProfileScreenProps) {
  const { genres, isPending, isError, retry } = useGenres();
  const insets = useSafeAreaInsets();
  // An unknown genre list is not an empty one, and rendering zero sections while the
  // first fetch is in flight with an empty cache is a false empty. A failed fetch with
  // nothing cached tells the same lie permanently, and these sections are the only way
  // into the collection, so that case gets a retry rather than an empty.
  const isUnknown = genres.length === 0 && isPending;
  const hasFailed = genres.length === 0 && isError;

  return (
    <SafeAreaView className="flex-1 bg-app" edges={["top", "left", "right"]}>
      <View className="flex-row items-center gap-3 px-4 py-3">
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Back to feed"
          onPress={onBack}
          className="size-11 items-center justify-center rounded-full border border-border"
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.foreground} />
        </BouncablePress>
        <Text accessibilityRole="header" className="font-extrabold text-2xl text-foreground">
          My Profile
        </Text>
      </View>

      <ProfileSummary />

      {isUnknown ? (
        <DanceSkeleton />
      ) : hasFailed ? (
        <View className="items-start gap-3 px-4">
          <Text accessibilityLiveRegion="polite" className="text-base text-copy">
            Couldn't load your styles.
          </Text>
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Retry loading your styles"
            onPress={retry}
            className="min-h-11 justify-center rounded-full border border-border px-6"
          >
            <Text className="font-bold text-base text-foreground">Try again</Text>
          </BouncablePress>
        </View>
      ) : genres.length === 0 ? (
        <Text className="px-4 text-base text-muted">No styles to show yet.</Text>
      ) : (
        <ScrollView
          testID="profile-sections"
          showsVerticalScrollIndicator={false}
          // The system bars overlay this screen, so the last row carries the inset
          // itself rather than the container reserving it for every section.
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <View>
            {/* In the order the server returned: the agreed order lives in
                `dance_genres.sort_order`, which is admin data, not client code. */}
            {genres.map((genre) => (
              <StyleSection
                key={genre.id}
                genre={genre}
                onOpenStyle={(styleId) => router.push(`/profile/style/${styleId}`)}
                onOpenMove={(moveId) => router.push(`/profile/${moveId}`)}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
