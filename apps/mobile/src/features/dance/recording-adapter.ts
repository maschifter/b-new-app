import { Directory, File, Paths } from "expo-file-system";

export interface DanceRecorder {
  readonly isRecording: boolean;
  startRecording(
    onFinished: (path: string) => void,
    onError: (error: Error) => void,
  ): Promise<void>;
  stopRecording(): Promise<void>;
  cancelRecording(): Promise<void>;
}

const simulationVideoPromises = new Map<string, Promise<string>>();

/** Downloads the public reference once, giving the upload flow a real local MP4. */
export function preloadSimulatedDanceVideo(sourceUrl: string): Promise<string> {
  const existing = simulationVideoPromises.get(sourceUrl);
  if (existing) return existing;
  const download = downloadSimulationVideo(sourceUrl).catch((error: unknown) => {
    simulationVideoPromises.delete(sourceUrl);
    throw error;
  });
  simulationVideoPromises.set(sourceUrl, download);
  return download;
}

async function downloadSimulationVideo(sourceUrl: string): Promise<string> {
  const destination = new Directory(Paths.cache, "dance-recording-simulation");
  destination.create({ idempotent: true });
  // The cache directory outlives the JS session that populated the in-memory map,
  // so a download into an existing name would throw on the next app launch.
  const cached = new File(destination, simulationFileName(sourceUrl));
  if (cached.exists) return cached.uri;
  const file = await File.downloadFileAsync(sourceUrl, cached);
  return file.uri;
}

// Derived from the whole URL, not its last segment: two moves can share a file
// name (and any URL without one would collapse onto a single shared default),
// which would hand a move back the previously cached clip of a different move.
function simulationFileName(sourceUrl: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < sourceUrl.length; index += 1) {
    hash ^= sourceUrl.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}.mp4`;
}

export async function createSimulatedDanceRecorder(
  sourceUrl: string,
  maxDurationSeconds: number,
): Promise<DanceRecorder> {
  const path = await preloadSimulatedDanceVideo(sourceUrl);
  let recording = false;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;
  let onFinished: ((path: string) => void) | null = null;

  const finish = () => {
    if (!recording || !onFinished) return;
    recording = false;
    onFinished(path);
  };

  return {
    get isRecording() {
      return recording;
    },
    // A simulated capture reads an already-downloaded file, so it has no failure
    // mode to report; `onError` is accepted only to match the real recorder.
    async startRecording(finished, _onError) {
      recording = true;
      onFinished = finished;
      finishTimer = setTimeout(finish, maxDurationSeconds * 1_000);
    },
    async stopRecording() {
      if (finishTimer) clearTimeout(finishTimer);
      finishTimer = null;
      finish();
    },
    async cancelRecording() {
      if (finishTimer) clearTimeout(finishTimer);
      finishTimer = null;
      recording = false;
      onFinished = null;
    },
  };
}
