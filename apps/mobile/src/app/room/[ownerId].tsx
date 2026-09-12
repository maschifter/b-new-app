import { ExploreRoomScreen } from "@/features/explore";
import { isUuidParam } from "@/lib/router/uuid-param";
import { Redirect, useLocalSearchParams } from "expo-router";

// Thin route entry: validate the segment, then hand off to the feature screen.
// The auth guard is applied by the Stack.Protected block in the root layout.
export default function RoomRoute() {
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  if (!isUuidParam(ownerId)) return <Redirect href="/explore" />;
  return <ExploreRoomScreen ownerId={ownerId} />;
}
