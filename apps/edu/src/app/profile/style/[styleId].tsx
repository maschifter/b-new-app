import { ProfileStyleScreen } from "@/features/profile";
import { isUuidParam } from "@/lib/router/uuid-param";
import { Redirect, router, useLocalSearchParams } from "expo-router";

export default function ProfileStyleRoute() {
  const { styleId } = useLocalSearchParams<{ styleId: string }>();
  if (!isUuidParam(styleId)) return <Redirect href="/profile" />;
  return <ProfileStyleScreen styleId={styleId} onBack={() => router.back()} />;
}
