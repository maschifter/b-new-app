import { FeedScreen } from "@/features/feed";
import { router } from "expo-router";

export default function FeedRoute() {
  return <FeedScreen onOpenProfile={() => router.push("/profile")} />;
}
