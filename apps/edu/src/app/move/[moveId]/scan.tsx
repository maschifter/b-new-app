import { RecordDanceScreen } from "@/features/scan";
import { isUuidParam } from "@/lib/router/uuid-param";
import { Redirect, router, useLocalSearchParams } from "expo-router";

// Thin route entry: validate the segment, then hand off to the shared flow screen.
export default function ScanRoute() {
  const { moveId } = useLocalSearchParams<{ moveId: string }>();
  if (!isUuidParam(moveId)) return <Redirect href="/" />;
  return (
    <RecordDanceScreen
      moveId={moveId}
      onBack={() => router.back()}
      // Document 01 section 3's mandated pre-prompt wording. The package keeps its
      // own strings for every other consumer.
      cameraPermissionCopy={{
        title: "Allow camera access",
        body: "The camera is used to scan your movement and calculate your score.",
        allowLabel: "Allow Camera",
        dismissLabel: "Not now",
      }}
      onRecordingComplete={({ path, duration, audioOffsetMs }) =>
        router.replace({
          pathname: "/move/[moveId]/result",
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
