import { supabase } from "@/lib/auth/supabase";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { router } from "expo-router";
import { Text } from "react-native";

export function SignOutButton() {
  // Query-cache cleanup is owned by AuthSessionProvider, which reacts to the
  // resulting SIGNED_OUT event — so explicit sign-out, session expiry, and
  // account replacement all follow the same cleanup path.
  const signOut = async () => {
    await supabase?.auth.signOut();
    router.replace("/auth/sign-in");
  };

  return (
    <BouncablePress
      accessibilityRole="button"
      onPress={signOut}
      className="rounded-[10px] border border-border px-[14px] py-2"
    >
      <Text className="text-sm font-bold text-foreground">Sign out</Text>
    </BouncablePress>
  );
}
