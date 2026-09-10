export type UploadMediaKind = "audio" | "image" | "video";

const ONE_MEBIBYTE = 1024 * 1024;
const MAX_BYTES: Record<UploadMediaKind, number> = {
  image: 10 * ONE_MEBIBYTE,
  video: 45 * ONE_MEBIBYTE,
  audio: 20 * ONE_MEBIBYTE,
};
const ACCEPTED_EXTENSIONS: Record<UploadMediaKind, readonly string[]> = {
  image: ["jpeg", "jpg", "png", "webp"],
  video: ["mp4"],
  audio: ["m4a", "mp3"],
};
export const MAX_VIDEO_BITRATE = 8 * ONE_MEBIBYTE;

function extension(filename: string): string | undefined {
  const index = filename.lastIndexOf(".");
  if (index <= 0 || index === filename.length - 1) return undefined;
  return filename.slice(index + 1).toLowerCase();
}

export function validateMediaFile(file: Pick<File, "name" | "size">, kind: UploadMediaKind) {
  const ext = extension(file.name);
  if (!ext || !ACCEPTED_EXTENSIONS[kind].includes(ext)) {
    return `Choose a supported ${kind} file.`;
  }
  const maxBytes = MAX_BYTES[kind];
  if (file.size > maxBytes) {
    return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} files must be ${maxBytes / ONE_MEBIBYTE} MB or smaller.`;
  }
  return undefined;
}

export function validateVideoBitrate(fileSize: number, durationSeconds: number | undefined) {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return "Video metadata could not be read. Export an H.264 MP4 at 1080p around 5 Mbps and retry.";
  }
  if ((fileSize * 8) / durationSeconds > MAX_VIDEO_BITRATE) {
    return "Video bitrate exceeds 8 Mbps. Export an H.264 MP4 at 1080p around 5 Mbps and retry.";
  }
  return undefined;
}

export function acceptForMediaKind(kind: UploadMediaKind) {
  if (kind === "video") return ".mp4,video/mp4";
  if (kind === "audio") return ".mp3,.m4a,audio/mpeg,audio/mp4";
  return "image/png,image/jpeg,image/webp";
}
