import { BouncablePress } from "@/components/bouncable-press";
import { Screen } from "@/components/screen";
import { useAuthSession } from "@/lib/auth/session-provider";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { SignOutButton } from "./sign-out-button";

export function ProfileScreen() {
  const { session } = useAuthSession();
  const email = session?.user.email ?? "Unknown account";
  const initial = email.trim().charAt(0).toUpperCase() || "?";
  const createdAt = session?.user.created_at;

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-extrabold tracking-[1.5px] text-neon">PROFILE</Text>
        <BouncablePress
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          className="rounded-[10px] border border-border px-[14px] py-2"
        >
          <Text className="text-sm font-bold text-foreground">Back</Text>
        </BouncablePress>
      </View>

      <View className="mt-12 items-center gap-3">
        <View className="size-20 items-center justify-center rounded-full bg-primary">
          <Text className="text-[34px] font-extrabold text-foreground">{initial}</Text>
        </View>
        <Text className="text-xl font-bold text-foreground">{email}</Text>
        {createdAt ? (
          <Text className="text-sm text-muted">Member since {formatDate(createdAt)}</Text>
        ) : null}
      </View>

      <View className="mt-auto">
        <SignOutButton />
      </View>
    </Screen>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
