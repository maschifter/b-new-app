import { RecordDanceScreen, toDanceClipParams } from "@/features/scan";
import { isUuidParam } from "@bnewapp/mobile-kit";
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
      onRecordingComplete={(clip) =>
        router.replace({
          pathname: "/move/[moveId]/result",
          params: { moveId, ...toDanceClipParams(clip) },
        })
      }
    />
  );
}
