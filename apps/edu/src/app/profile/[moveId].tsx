import { ProfileMoveScreen } from "@/features/profile";
import { isUuidParam } from "@/lib/router/uuid-param";
import { Redirect, router, useLocalSearchParams } from "expo-router";

export default function ProfileMoveRoute() {
  const { moveId } = useLocalSearchParams<{ moveId: string }>();
  if (!isUuidParam(moveId)) return <Redirect href="/profile" />;
  return <ProfileMoveScreen moveId={moveId} onBack={() => router.back()} />;
}
