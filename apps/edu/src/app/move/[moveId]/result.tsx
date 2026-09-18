import { ScanResultScreen, parseDanceClipParams } from "@/features/scan";
import { isUuidParam } from "@bnewapp/mobile-kit";
import { Redirect, router, useLocalSearchParams } from "expo-router";

export default function ScanResultRoute() {
  const { moveId, clipPath, clipDuration, clipAudioOffsetMs } = useLocalSearchParams<{
    moveId: string;
    clipPath: string;
    clipDuration: string;
    clipAudioOffsetMs?: string;
  }>();
  const clip = parseDanceClipParams({ clipPath, clipDuration, clipAudioOffsetMs });
  if (!isUuidParam(moveId) || clip === null) {
    return <Redirect href="/" />;
  }
  return (
    <ScanResultScreen
      moveId={moveId}
      clipPath={clip.path}
      clipDuration={clip.duration}
      clipAudioOffsetMs={clip.audioOffsetMs}
      onBack={() => router.replace(`/move/${moveId}/scan`)}
      // The profile is pushed from the feed, never onto the scan stack, so Back from it
      // reaches the feed as document 03 section 2 requires.
      onFinished={() => {
        router.dismissTo("/");
        router.push("/profile");
      }}
    />
  );
}
