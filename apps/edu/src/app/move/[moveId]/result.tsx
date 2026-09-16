import { DanceResultScreen } from "@/features/scan";
import { isUuidParam } from "@/lib/router/uuid-param";
import { Redirect, router, useLocalSearchParams } from "expo-router";

function isLocalVideoPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("file://");
}

/**
 * A measured 0 is a real offset, so this cannot use a falsy check: only a missing or
 * unparseable param counts as absent, and the server then falls back to the computed
 * timeline offset.
 */
function parseAudioOffsetMs(value: string | undefined): number | undefined {
  // The empty check is not redundant: `Number("")` is 0, which would turn a dropped param
  // into a measured "start of the track".
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export default function ScanResultRoute() {
  const { moveId, clipPath, clipDuration, clipAudioOffsetMs } = useLocalSearchParams<{
    moveId: string;
    clipPath: string;
    clipDuration: string;
    clipAudioOffsetMs?: string;
  }>();
  const duration = Number(clipDuration);
  const audioOffsetMs = parseAudioOffsetMs(clipAudioOffsetMs);
  if (
    !isUuidParam(moveId) ||
    !isLocalVideoPath(clipPath) ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return <Redirect href="/" />;
  }
  return (
    <DanceResultScreen
      moveId={moveId}
      clipPath={clipPath}
      clipDuration={duration}
      {...(audioOffsetMs === undefined ? {} : { clipAudioOffsetMs: audioOffsetMs })}
      onRecordAgain={() => router.replace(`/move/${moveId}/scan`)}
      onDone={() => router.dismissTo("/")}
    />
  );
}
