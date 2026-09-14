import type {
  ApiSuccess,
  HealthStatus,
  SaveStudioRoomBody,
  StudioRoom,
  StudioRoomWithVisitorCount,
  UserProfile,
} from "@bnewapp/types";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { resolveApiUrl as resolveConfiguredApiUrl } from "./api-url";

const API_PORT = 3000;

function getMetroHost(): string | undefined {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;
  return hostUri?.split(":")[0] || undefined;
}

function resolveApiUrl(): string {
  return resolveConfiguredApiUrl({
    configuredUrl: process.env.EXPO_PUBLIC_API_URL,
    isDevelopment: __DEV__,
    metroHost: getMetroHost(),
    platform: Platform.OS,
    port: API_PORT,
  });
}

// Resolved once at module load. Exported so feature-local api modules build their
// request URLs off the same base without re-resolving the Metro/env host.
export const apiUrl = resolveApiUrl();

// Bearer auth header for authenticated requests. Feature api modules reuse this
// instead of re-spelling the `Bearer ${accessToken}` template per call.
export function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

// Auth header plus JSON content type for requests that send a body.
export function jsonHeaders(accessToken: string): Record<string, string> {
  return { ...authHeaders(accessToken), "Content-Type": "application/json" };
}

// Unwrap the shared `ApiSuccess<T>` envelope, throwing `errorMessage` on a
// non-2xx response. For endpoints whose failures need the server's message or
// custom validation, read the response directly instead.
export async function unwrapApiSuccess<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) throw new Error(errorMessage);
  const body = (await response.json()) as ApiSuccess<T>;
  return body.data;
}

export async function getHealth(): Promise<HealthStatus> {
  const response = await fetch(`${apiUrl}/health`);
  if (!response.ok) {
    throw new Error("Unable to reach the server");
  }
  return (await response.json()) as HealthStatus;
}

export async function getCurrentUser(accessToken: string): Promise<UserProfile> {
  const response = await fetch(`${apiUrl}/api/user/me`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<UserProfile>(response, "Unable to load your profile");
}

export async function getStudioRoom(
  accessToken: string,
): Promise<StudioRoomWithVisitorCount | null> {
  const response = await fetch(`${apiUrl}/api/studio/room`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<StudioRoomWithVisitorCount | null>(
    response,
    "Unable to load your studio room",
  );
}

export async function saveStudioRoom(
  accessToken: string,
  snapshot: SaveStudioRoomBody,
): Promise<StudioRoom> {
  const response = await fetch(`${apiUrl}/api/studio/room`, {
    method: "PUT",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(snapshot),
  });
  return unwrapApiSuccess<StudioRoom>(response, "Unable to save your studio room");
}
