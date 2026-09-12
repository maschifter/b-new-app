import { apiUrl, authHeaders, jsonHeaders, unwrapApiSuccess } from "@/lib/api/client";
import type {
  CreateDancePostBody,
  CreateDancePostResult,
  DanceGenre,
  DanceMove,
  DanceMovesCursor,
  DanceMovesPage,
  DancePost,
  ScanStatus,
} from "@bnewapp/types";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";

interface GetDanceMovesParams {
  genreId?: string | null;
  cursor?: DanceMovesCursor | null;
  limit?: number;
}

export async function getDanceGenres(accessToken: string): Promise<DanceGenre[]> {
  const response = await fetch(`${apiUrl}/api/dance/genres`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<DanceGenre[]>(response, "Unable to load dance genres");
}

export async function getDanceMoves(
  accessToken: string,
  { genreId, cursor, limit = 20 }: GetDanceMovesParams = {},
): Promise<DanceMovesPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (genreId) params.set("genre_id", genreId);
  if (cursor) params.set("cursor", JSON.stringify(cursor));
  const response = await fetch(`${apiUrl}/api/dance/moves?${params.toString()}`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<DanceMovesPage>(response, "Unable to load dance moves");
}

export async function getDanceMove(accessToken: string, moveId: string): Promise<DanceMove> {
  const response = await fetch(`${apiUrl}/api/dance/moves/${moveId}`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<DanceMove>(response, "Unable to load this dance move");
}

export async function createDancePost(
  accessToken: string,
  input: CreateDancePostBody,
): Promise<CreateDancePostResult> {
  const response = await fetch(`${apiUrl}/api/dance/posts`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return unwrapApiSuccess<CreateDancePostResult>(response, "Unable to create dance scan");
}

// `File.bytes()` holds the whole clip in JS memory, so the upload is bounded by
// what a low-end device can allocate at once. A capture is `maxDuration` seconds
// at VIDEO_BIT_RATE (60s @ 1.5 Mbps is ~11 MB), leaving this ceiling ~5x of head
// room; anything above it means the recorder was misconfigured and failing fast
// beats an out-of-memory crash.
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

// React Native's global `fetch` is whatwg-fetch, which only recognizes a body
// whose prototype chain contains the global `Blob`. An `expo-file-system` `File`
// merely implements that interface, so the global fetch would silently send no
// bytes at all — `expo/fetch` is the only fetch in this runtime that accepts it.
// The bytes are passed explicitly rather than the `File` because `expo/fetch`
// overrides `Content-Type` with `File.type`, which is empty for an unreadable file.
export async function uploadDanceVideo(signedUrl: string, localPath: string): Promise<void> {
  const file = new File(localPath);
  const size = file.size;
  if (size !== null && size > MAX_UPLOAD_BYTES) {
    throw new Error("This recording is too large to upload");
  }
  const body = await file.bytes();
  const response = await expoFetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body,
  });
  if (!response.ok) throw new Error("Unable to upload dance video");
}

export async function markDancePostUploaded(
  accessToken: string,
  postId: string,
): Promise<DancePost> {
  const response = await fetch(`${apiUrl}/api/dance/posts/${postId}/uploaded`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<DancePost>(response, "Unable to queue dance scan");
}

export async function discardUploadingDancePost(accessToken: string, postId: string): Promise<void> {
  const response = await fetch(`${apiUrl}/api/dance/posts/${postId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  await unwrapApiSuccess<null>(response, "Unable to discard incomplete dance scan");
}

export async function getDanceScoreStatus(
  accessToken: string,
  postId: string,
): Promise<ScanStatus> {
  const response = await fetch(`${apiUrl}/api/dance/posts/${postId}/score`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<ScanStatus>(response, "Unable to get dance score");
}
