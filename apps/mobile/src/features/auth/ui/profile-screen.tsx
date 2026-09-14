import { BouncablePress } from "@/components/bouncable-press";
import { Screen } from "@/components/screen";
import { DancePostGrid } from "@/features/dance";
import { useAuthSession } from "@/lib/auth/session-provider";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, View } from "react-native";

interface ProfileScreenProps {
  onOpenSettings: () => void;
}

export function ProfileScreen({ onOpenSettings }: ProfileScreenProps) {
  const { session } = useAuthSession();
  const email = session?.user.email ?? "Unknown account";
  const initial = email.trim().charAt(0).toUpperCase() || "?";
  const createdAt = session?.user.created_at;

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          className="size-11 items-center justify-center rounded-full border border-border bg-panel"
        >
          <Ionicons name="chevron-back" size={22} color="#F8F7FC" />
        </BouncablePress>
        <Text
          accessibilityRole="header"
          className="text-xs font-extrabold tracking-[1.5px] text-neon"
        >
          PROFILE
        </Text>
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={onOpenSettings}
          className="size-11 items-center justify-center rounded-full border border-border bg-panel"
        >
          <Ionicons name="settings-outline" size={20} color="#F8F7FC" />
        </BouncablePress>
      </View>

      <DancePostGrid
        header={
          <>
            <View className="mt-8 items-center gap-3">
              <View className="size-20 items-center justify-center rounded-full bg-primary">
                <Text className="text-[34px] font-extrabold text-foreground">{initial}</Text>
              </View>
              <Text className="text-xl font-bold text-foreground">{email}</Text>
              {createdAt ? (
                <Text className="text-sm text-muted">Member since {formatDate(createdAt)}</Text>
              ) : null}
            </View>

            <Text className="mb-3 mt-8 text-xs font-extrabold tracking-[1.5px] text-neon">
              MY DANCES
            </Text>
          </>
        }
      />
    </Screen>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
