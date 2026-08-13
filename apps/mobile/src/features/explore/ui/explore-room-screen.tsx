import { MobileQueryErrorBoundary } from "@/components/error-boundary";
import { StudioStage } from "@/features/studio";
import { ROOM_TEMPLATE, templateById } from "@bnewapp/studio-core";
import { useAtomValue } from "jotai";
import { Suspense } from "react";
import { StyleSheet, View } from "react-native";
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

  const template = templateById(room.snapshot.templateId) ?? ROOM_TEMPLATE;

  return (
    <View style={styles.container}>
      <View
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <StudioStage template={template} map={room.snapshot.map} mode="visit" />
      </View>
      <ExploreRoomHeader username={room.username} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#17171D", flex: 1 },
});
