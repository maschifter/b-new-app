import { AppHeader } from "@/components/app-header";
import { Screen } from "@/components/screen";
import { DancePostGrid } from "@/features/dance";
import { useAuthSession } from "@/lib/auth/session-provider";
import { COLORS } from "@bnewapp/mobile-kit/theme/colors";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
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
      <AppHeader
        title="PROFILE"
        onBack={() => router.back()}
        trailing={
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={onOpenSettings}
            className="size-11 items-center justify-center rounded-full border border-border bg-panel"
          >
            <Ionicons name="settings-outline" size={20} color={COLORS.foreground} />
          </BouncablePress>
        }
      />

      <DancePostGrid
        onOpenPost={(postId) =>
          router.push({ pathname: "/dance/post/[postId]", params: { postId } })
        }
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
