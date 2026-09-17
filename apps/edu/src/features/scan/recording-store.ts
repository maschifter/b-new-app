import { isSimulatedDanceClipPath } from "@bnewapp/dance-flow/dev";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Every file operation behind a personal recording. `expo-file-system`'s `File` /
 * `Directory` / `Paths` API is synchronous, so these throw rather than reject.
 *
 * The document directory is used and never the cache directory: the cache is
 * reclaimable by the OS, and a personal video that disappears is a broken promise
 * rather than a cache miss.
 */

const DIRECTORY_NAME = "personal-recordings";

function recordingsDirectory(): Directory {
  return new Directory(Paths.document, DIRECTORY_NAME);
}

/**
 * Resolves a stored pointer. Only the file name is persisted, so the container path is
 * read from `Paths.document` on every launch rather than from a value written under a
 * container id the OS is free to reassign.
 */
export function personalRecordingUri(fileName: string): string {
  return new File(recordingsDirectory(), fileName).uri;
}

/** A clip worth offering to save: a local path that exists and holds bytes. */
export function isPlayableClip(path: string): boolean {
  if (!path.startsWith("file://")) return false;
  try {
    const file = new File(path);
    return file.exists && file.size > 0;
  } catch {
    return false;
  }
}

/**
 * The temporary capture. A simulated clip is a shared cached download reused by every
 * later simulated run, so deleting it would both destroy something that is not the
 * user's clip and force the next simulated scan to re-download.
 */
export function deleteTemporaryClip(path: string): void {
  if (isSimulatedDanceClipPath(path)) return;
  deleteFileIfPresent(path);
}

function deleteFileIfPresent(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A file that cannot be removed is a leak the next launch's reconciliation collects.
  }
}

export interface SavePersonalRecordingFileInput {
  moveId: string;
  clipPath: string;
  durationS: number;
  /** The pointer's current file name, replaced by this save. */
  previousFileName: string | null;
  /** The single MMKV pointer write; the order around it is this function's contract. */
  persist: (input: { moveId: string; fileName: string; durationS: number }) => void;
  /** The stored file name, read after `persist` and before anything is destroyed. */
  readPersisted: (moveId: string) => string | null;
  now?: () => number;
}

/**
 * The safe save, which is also the safe replacement. The copy goes to a fresh name
 * every time, which is what makes the pointer write orderable at all: a copy onto the
 * old path would destroy the previous video before the pointer moved.
 *
 * A throw before the pointer write, and a write the store rejects, both leave the
 * pointer and the old file untouched. A crash between an accepted write and the old
 * file's deletion leaks one file, which `reconcilePersonalRecordings` collects on the
 * next launch.
 */
export function savePersonalRecordingFile({
  moveId,
  clipPath,
  durationS,
  previousFileName,
  persist,
  readPersisted,
  now = Date.now,
}: SavePersonalRecordingFileInput): string {
  const directory = recordingsDirectory();
  directory.create({ idempotent: true, intermediates: true });

  const fileName = `${moveId}-${now()}.mp4`;
  const destination = new File(directory, fileName);
  new File(clipPath).copy(destination);

  const saved = new File(destination.uri);
  if (!saved.exists || saved.size <= 0) {
    throw new Error("The copied recording is not playable");
  }

  persist({ moveId, fileName, durationS });
  if (readPersisted(moveId) !== fileName) {
    deleteFileIfPresent(saved.uri);
    throw new Error("The recording pointer was not stored");
  }

  if (previousFileName !== null && previousFileName !== fileName) {
    deleteFileIfPresent(personalRecordingUri(previousFileName));
  }
  deleteTemporaryClip(clipPath);
  return fileName;
}

export interface ReconcilePersonalRecordingsInput {
  /** `moveId` → `fileName`, as the collection holds them. */
  pointers: Record<string, string>;
  dropPointer: (moveId: string) => void;
}

/**
 * Both directions, or the device leaks in one of them: a pointer whose file is gone
 * renders an unplayable video, and a file no pointer references is dead weight.
 */
export function reconcilePersonalRecordings({
  pointers,
  dropPointer,
}: ReconcilePersonalRecordingsInput): void {
  const live = new Set<string>();
  for (const [moveId, fileName] of Object.entries(pointers)) {
    let exists = false;
    try {
      exists = new File(recordingsDirectory(), fileName).exists;
    } catch {
      exists = false;
    }
    if (exists) live.add(fileName);
    else dropPointer(moveId);
  }

  let entries: (Directory | File)[];
  try {
    const directory = recordingsDirectory();
    if (!directory.exists) return;
    entries = directory.list();
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!(entry instanceof File)) continue;
    if (!live.has(entry.name)) deleteFileIfPresent(entry.uri);
  }
}
