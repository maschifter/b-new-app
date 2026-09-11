import { StudioScreen, StudioSync, useStudioVisitorCount } from "@/features/studio";
import { useAuthSession } from "@/lib/auth/session-provider";
import { router } from "expo-router";

export default function StudioTab() {
  const { session } = useAuthSession();
  const avatarLabel = session?.user.email?.trim().charAt(0).toUpperCase();
  const ownerId = session?.user.id;
  const visitorCount = useStudioVisitorCount(ownerId);
  // Storage is keyed by owner so a room survives across sessions on this device;
  // falls back to a shared "local" room when there is no signed-in user.
  return (
    <>
      {ownerId ? <StudioSync ownerId={ownerId} /> : null}
      <StudioScreen
        ownerId={ownerId}
        visitorCount={visitorCount}
        avatarLabel={avatarLabel}
        onOpenProfile={() => router.push("/profile")}
        onOpenShop={() => router.push("/shop")}
        onOpenDance={() => router.push("/dance")}
      />
    </>
  );
}
