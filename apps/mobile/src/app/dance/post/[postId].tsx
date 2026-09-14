import { DancePostDetailScreen } from "@/features/dance";
import { isUuidParam } from "@/lib/router/uuid-param";
import { Redirect, router, useLocalSearchParams } from "expo-router";

export default function DancePostDetailRoute() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  if (!isUuidParam(postId)) return <Redirect href="/profile" />;
  return <DancePostDetailScreen postId={postId} onBack={() => router.back()} />;
}
