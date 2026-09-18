import { LearnDanceScreen } from "@/features/dance";
import { isUuidParam } from "@bnewapp/mobile-kit";
import { Redirect, router, useLocalSearchParams } from "expo-router";

// Thin route entry: validate the segment, then hand off to the feature screen.
// The auth guard is applied by the Stack.Protected block in the root layout.
export default function DanceMoveRoute() {
  const { moveId } = useLocalSearchParams<{ moveId: string }>();
  if (!isUuidParam(moveId)) return <Redirect href="/dance" />;
  return (
    <LearnDanceScreen
      moveId={moveId}
      onBack={() => router.back()}
      onStartRecording={() =>
        router.push({ pathname: "/dance/[moveId]/record", params: { moveId } })
      }
    />
  );
}
