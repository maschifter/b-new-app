import { ExploreRoomScreen } from "@/features/explore";
import { Redirect, useLocalSearchParams } from "expo-router";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Thin route entry: validate the segment, then hand off to the feature screen.
// The auth guard is applied by the Stack.Protected block in the root layout.
export default function RoomRoute() {
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  if (typeof ownerId !== "string" || !UUID_PATTERN.test(ownerId)) {
    return <Redirect href="/explore" />;
  }
  return <ExploreRoomScreen ownerId={ownerId} />;
}
