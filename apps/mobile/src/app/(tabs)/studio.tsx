import { SignOutButton } from "@/components/sign-out-button";
import { StudioScreen } from "@/features/studio";
import { useAuthSession } from "@/lib/auth/session-provider";

export default function StudioTab() {
  const { session } = useAuthSession();
  // Storage is keyed by owner so a room survives across sessions on this device;
  // falls back to a shared "local" room when there is no signed-in user.
  return <StudioScreen ownerId={session?.user.id} headerRight={<SignOutButton />} />;
}
