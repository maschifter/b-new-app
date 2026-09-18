import { RecordDanceScreen } from "@/features/dance";
import { isUuidParam } from "@bnewapp/mobile-kit";
import { Redirect, router, useLocalSearchParams } from "expo-router";

// Thin route entry: validate the segment, then hand off to the feature screen.
// The auth guard is applied by the Stack.Protected block in the root layout.
export default function DanceRecordRoute() {
  const { moveId } = useLocalSearchParams<{ moveId: string }>();
  if (!isUuidParam(moveId)) return <Redirect href="/dance" />;
  return (
    <RecordDanceScreen
      moveId={moveId}
      onBack={() => router.back()}
      onRecordingComplete={({ path, duration, audioOffsetMs }) =>
        router.replace({
          pathname: "/dance/[moveId]/result",
          params: {
            moveId,
            clipPath: path,
            clipDuration: String(duration),
            // Omitted rather than stringified when absent, so the result route can tell
            // "never measured" from a measured 0.
            ...(audioOffsetMs === undefined ? {} : { clipAudioOffsetMs: String(audioOffsetMs) }),
          },
        })
      }
    />
  );
}
