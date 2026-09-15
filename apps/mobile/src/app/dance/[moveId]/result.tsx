import { DanceResultScreen } from "@/features/dance";
import { isUuidParam } from "@/lib/router/uuid-param";
import { Redirect, router, useLocalSearchParams } from "expo-router";

function isLocalVideoPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("file://");
}

export default function DanceResultRoute() {
  const { moveId, clipPath, clipDuration } = useLocalSearchParams<{
    moveId: string;
    clipPath: string;
    clipDuration: string;
  }>();
  const duration = Number(clipDuration);
  if (
    !isUuidParam(moveId) ||
    !isLocalVideoPath(clipPath) ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return <Redirect href="/dance" />;
  }
  return (
    <DanceResultScreen
      moveId={moveId}
      clipPath={clipPath}
      clipDuration={duration}
      onRecordAgain={() => router.replace(`/dance/${moveId}/record`)}
      onDone={() => router.dismissTo("/studio")}
    />
  );
}
