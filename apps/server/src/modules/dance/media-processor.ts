import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { encode } from "blurhash";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { AUDIO_OFFSET_CEILING_MS } from "./config.js";

const run = promisify(execFile);

// ffprobe comes from @ffprobe-installer, not ffprobe-static: the latter ships an
// x86_64 binary even under bin/darwin/arm64, which macOS 27 can no longer run since
// it dropped Rosetta 2. Its platform package chmods the binary in a postinstall, so
// each target must also be listed in the root package.json onlyBuiltDependencies.

const BLURHASH_EDGE = 32;
const BLURHASH_COMPONENTS = 4;
/** Latest safe poster seek: far enough in to skip a black first frame, early enough to exist. */
const MAX_POSTER_SEEK_SECONDS = 1;

export interface MergeArgsInput {
  videoPath: string;
  musicPath: string;
  offsetSeconds: number;
  outputPath: string;
}

export interface PosterArgsInput {
  videoPath: string;
  seekSeconds: number;
  outputPath: string;
}

export interface MediaProbe {
  durationSeconds: number | null;
  videoCodec: string | null;
}

export interface DanceMediaInput {
  /** Local path of the downloaded recording. */
  videoPath: string;
  /** Local path of the downloaded music track, or null for a move without music. */
  musicPath: string | null;
  /** Music playhead at the first recorded frame; clamped again against the real track. */
  audioOffsetMs: number;
  workDir: string;
}

export interface DanceMediaResult {
  /** Null when the post has no music, or the recording is not a copyable H.264 stream. */
  mergedPath: string | null;
  posterPath: string;
  blurhash: string;
  skippedMergeReason: string | null;
}

export type DanceMediaProcessor = (input: DanceMediaInput) => Promise<DanceMediaResult>;

function seconds(value: number): string {
  return value.toFixed(3);
}

/**
 * `-ss` sits between the two inputs deliberately: it is an input seek applied to the
 * music. `-af apad` pads the seeked track with silence so `-shortest` lands on the video
 * length rather than truncating the dance when the remaining track is shorter than the
 * recording. `-fflags +shortest` and `-max_interleave_delta` are output-side flags — they
 * must follow the maps and precede the output path, or they apply to the input demuxer
 * and silently do nothing.
 */
export function buildMergeArgs(input: MergeArgsInput): string[] {
  return [
    "-y",
    "-i",
    input.videoPath,
    "-ss",
    seconds(input.offsetSeconds),
    "-i",
    input.musicPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-af",
    "apad",
    "-shortest",
    "-fflags",
    "+shortest",
    "-max_interleave_delta",
    "100M",
    "-movflags",
    "+faststart",
    input.outputPath,
  ];
}

export function buildPosterArgs(input: PosterArgsInput): string[] {
  return [
    "-y",
    ...(input.seekSeconds > 0 ? ["-ss", seconds(input.seekSeconds)] : []),
    "-i",
    input.videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    input.outputPath,
  ];
}

/**
 * Seek for the poster frame, derived from the *probed* duration rather than the reported
 * `video_length_s`: a fast stop floors the client-side duration at 0.1 s, and rows written
 * before the device-side timing fix over-report by the camera-start latency. Seeking past
 * the end yields no frame and a non-zero exit, so a sub-second clip takes its first frame.
 */
export function posterSeekSeconds(durationSeconds: number | null): number {
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds < 1) {
    return 0;
  }
  return Math.min(MAX_POSTER_SEEK_SECONDS, durationSeconds / 2);
}

/**
 * Clamp the offset twice: to the request-edge ceiling (defence in depth — the Zod bound
 * already rejects more) and to the track's real duration, which only the worker knows.
 * Seeking past EOF leaves an empty audio stream, and `apad` over an empty stream is
 * build-dependent. A short track paired with a large beat-drop delay reaches this without
 * any malicious client.
 */
export function clampAudioOffsetSeconds(
  audioOffsetMs: number,
  musicDurationSeconds: number | null,
): number {
  const bounded = Math.min(Math.max(audioOffsetMs, 0), AUDIO_OFFSET_CEILING_MS) / 1000;
  if (
    musicDurationSeconds === null ||
    !Number.isFinite(musicDurationSeconds) ||
    musicDurationSeconds <= 0
  ) {
    return 0;
  }
  return Math.min(bounded, Math.max(musicDurationSeconds - 1, 0));
}

function binaryPath(value: string | null, name: string): string {
  if (!value) throw new Error(`${name} binary is unavailable`);
  return value;
}

interface ProbeStream {
  codec_name?: string;
  codec_type?: string;
}

export async function probeMedia(path: string, timeoutMs: number): Promise<MediaProbe> {
  const { stdout } = await run(
    binaryPath(ffprobeInstaller.path, "ffprobe"),
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-i", path],
    { timeout: timeoutMs },
  );
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: ProbeStream[];
  };
  const duration = Number(parsed.format?.duration);
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  return {
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    videoCodec: video?.codec_name ?? null,
  };
}

/**
 * Blurhash of the poster frame. The resize is load-bearing twice: `encode` is pure JS on
 * the event loop, and the dimensions must come from `info` — `fit: "inside"` preserves the
 * aspect ratio, so a 16:9 frame comes back 32x18 and encoding it as 32x32 reads past the
 * buffer.
 */
export async function encodePosterBlurhash(posterPath: string): Promise<string> {
  const { data, info } = await sharp(posterPath)
    .resize(BLURHASH_EDGE, BLURHASH_EDGE, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    BLURHASH_COMPONENTS,
    BLURHASH_COMPONENTS,
  );
}

export function createDanceMediaProcessor(options: {
  ffmpegTimeoutMs: number;
}): DanceMediaProcessor {
  const ffmpeg = () => binaryPath(ffmpegStatic, "ffmpeg");

  return async function processDanceMedia(input: DanceMediaInput): Promise<DanceMediaResult> {
    const video = await probeMedia(input.videoPath, options.ffmpegTimeoutMs);

    const posterPath = join(input.workDir, "poster.jpg");
    const seek = posterSeekSeconds(video.durationSeconds);
    try {
      await run(
        ffmpeg(),
        buildPosterArgs({ videoPath: input.videoPath, seekSeconds: seek, outputPath: posterPath }),
        { timeout: options.ffmpegTimeoutMs },
      );
    } catch (error) {
      if (seek === 0) throw error;
      await run(
        ffmpeg(),
        buildPosterArgs({ videoPath: input.videoPath, seekSeconds: 0, outputPath: posterPath }),
        { timeout: options.ffmpegTimeoutMs },
      );
    }
    const blurhash = await encodePosterBlurhash(posterPath);

    if (input.musicPath === null) {
      return { mergedPath: null, posterPath, blurhash, skippedMergeReason: "no music track" };
    }
    // Remuxing a non-H.264 stream with `-c:v copy` would produce an unplayable MP4, and
    // transcoding it silently is not this job's budget. Skip and keep the original.
    if (video.videoCodec !== "h264") {
      return {
        mergedPath: null,
        posterPath,
        blurhash,
        skippedMergeReason: `unsupported video codec: ${video.videoCodec ?? "unknown"}`,
      };
    }

    const music = await probeMedia(input.musicPath, options.ffmpegTimeoutMs);
    const mergedPath = join(input.workDir, "merged.mp4");
    await run(
      ffmpeg(),
      buildMergeArgs({
        videoPath: input.videoPath,
        musicPath: input.musicPath,
        offsetSeconds: clampAudioOffsetSeconds(input.audioOffsetMs, music.durationSeconds),
        outputPath: mergedPath,
      }),
      { timeout: options.ffmpegTimeoutMs },
    );

    return { mergedPath, posterPath, blurhash, skippedMergeReason: null };
  };
}
