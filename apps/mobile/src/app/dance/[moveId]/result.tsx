import { DanceResultScreen, parseDanceClipParams } from "@/features/dance";
import { isUuidParam } from "@bnewapp/mobile-kit";
import { Redirect, router, useLocalSearchParams } from "expo-router";

export default function DanceResultRoute() {
  const { moveId, clipPath, clipDuration, clipAudioOffsetMs } = useLocalSearchParams<{
    moveId: string;
    clipPath: string;
    clipDuration: string;
    clipAudioOffsetMs?: string;
  }>();
  const clip = parseDanceClipParams({ clipPath, clipDuration, clipAudioOffsetMs });
  if (!isUuidParam(moveId) || clip === null) {
    return <Redirect href="/dance" />;
  }
  return (
    <DanceResultScreen
      moveId={moveId}
      clipPath={clip.path}
      clipDuration={clip.duration}
      clipAudioOffsetMs={clip.audioOffsetMs}
      onRecordAgain={() => router.replace(`/dance/${moveId}/record`)}
      onDone={() => router.dismissTo("/studio")}
    />
  );
}
