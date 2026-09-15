import { MobileQueryErrorBoundary } from "@/components/error-boundary";
import { StudioStage } from "@/features/studio";
import { templateOrDefault } from "@bnewapp/studio-core";
import { useAtomValue } from "jotai";
import { Suspense } from "react";
import { View } from "react-native";
import { exploreRoomQueryAtomFamily } from "../_atoms/queries";
import { ExploreRoomHeader, ExploreRoomMessage, ExploreRoomShell } from "./explore-room-layout";
import { ExploreRoomSkeleton } from "./explore-room-skeleton";

// Read-only view of another dancer's room. The query is scoped to the signed-in
// viewer's cache; this screen owns its loading / not-found / error states and
// never touches MMKV (visited rooms are pure server data).
export function ExploreRoomScreen({ ownerId }: { ownerId: string }) {
  return (
    <MobileQueryErrorBoundary
      title="Couldn't load this studio"
      retryLabel="Retry loading this studio"
    >
      <Suspense fallback={<ExploreRoomSkeleton />}>
        <ExploreRoomContent ownerId={ownerId} />
      </Suspense>
    </MobileQueryErrorBoundary>
  );
}

function ExploreRoomContent({ ownerId }: { ownerId: string }) {
  const { data: room } = useAtomValue(exploreRoomQueryAtomFamily(ownerId));

  if (!room) {
    return (
      <ExploreRoomShell>
        <ExploreRoomMessage title="Studio not found" copy="This dancer hasn't set up a room yet." />
      </ExploreRoomShell>
    );
  }

  const template = templateOrDefault(room.snapshot.templateId);

  return (
    <View className="flex-1 bg-panel">
      <View
        className="absolute inset-0"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <StudioStage template={template} map={room.snapshot.map} mode="visit" />
      </View>
      <ExploreRoomHeader username={room.username} visitorCount={room.visitorCount} />
    </View>
  );
}
