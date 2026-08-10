import { StudioScreen } from "@/features/studio";
import { useAuthSession } from "@/lib/auth/session-provider";
import { router } from "expo-router";

export default function StudioTab() {
  const { session } = useAuthSession();
  const avatarLabel = session?.user.email?.trim().charAt(0).toUpperCase();
  // Storage is keyed by owner so a room survives across sessions on this device;
  // falls back to a shared "local" room when there is no signed-in user.
  return (
    <StudioScreen
      ownerId={session?.user.id}
      avatarLabel={avatarLabel}
      onOpenProfile={() => router.push("/profile")}
    />
  );
}
