import { LearnDanceScreen } from "@/features/dance";
import { Redirect, router, useLocalSearchParams } from "expo-router";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function DanceMoveRoute() {
  const { moveId } = useLocalSearchParams<{ moveId: string }>();
  if (typeof moveId !== "string" || !UUID_PATTERN.test(moveId)) return <Redirect href="/dance" />;
  return <LearnDanceScreen moveId={moveId} onBack={() => router.back()} />;
}
