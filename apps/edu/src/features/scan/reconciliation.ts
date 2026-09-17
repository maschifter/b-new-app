// A second, deliberately tiny public entry beside `index.ts`, for the same reason
// `@bnewapp/dance-flow/dev` exists: the root layout mounts this hook, and `index.ts`
// re-exports `RecordDanceScreen` — importing the hook from there would pull the camera
// and audio stack into the root module graph. Keep this file free of screen imports.
import { deletePersonalRecordingAtom, personalRecordingsAtom } from "@/lib/collection";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { reconcilePersonalRecordings } from "./recording-store";

/**
 * Mounted once, below the session gate. It runs in an effect rather than at module load
 * because the file-system calls are synchronous and a directory read would sit on the
 * first frame.
 */
export function usePersonalRecordingReconciliation(): void {
  const recordings = useAtomValue(personalRecordingsAtom);
  const dropPointer = useSetAtom(deletePersonalRecordingAtom);
  // Read through a ref so reconciliation runs once per launch and not on every write
  // it performs itself.
  const recordingsRef = useRef(recordings);
  recordingsRef.current = recordings;

  useEffect(() => {
    const pointers: Record<string, string> = {};
    for (const [moveId, recording] of Object.entries(recordingsRef.current)) {
      pointers[moveId] = recording.fileName;
    }
    reconcilePersonalRecordings({ pointers, dropPointer });
  }, [dropPointer]);
}
