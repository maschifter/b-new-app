import type {
  ApiSuccess,
  HealthStatus,
  SaveStudioRoomBody,
  StudioRoom,
  UserProfile,
} from "@bnewapp/types";
import Constants from "expo-constants";
import { Platform } from "react-native";

const API_PORT = 3000;
const defaultApiUrl =
  Platform.OS === "android" ? `http://10.0.2.2:${API_PORT}` : `http://localhost:${API_PORT}`;

function rewriteAndroidLocalhost(url: string): string {
  return Platform.OS === "android"
    ? url.replace(/\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, "//10.0.2.2")
    : url;
}

function getMetroHost(): string | undefined {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;
  return hostUri?.split(":")[0] || undefined;
}

function resolveApiUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;

  if (!__DEV__) return configuredUrl ?? defaultApiUrl;
  if (configuredUrl) return rewriteAndroidLocalhost(configuredUrl);

  const metroHost = getMetroHost();
  return metroHost ? rewriteAndroidLocalhost(`http://${metroHost}:${API_PORT}`) : defaultApiUrl;
}

// Resolved once at module load. Exported so feature-local api modules build their
// request URLs off the same base without re-resolving the Metro/env host.
export const apiUrl = resolveApiUrl();

export async function getHealth(): Promise<HealthStatus> {
  const response = await fetch(`${apiUrl}/health`);
  if (!response.ok) {
    throw new Error("Unable to reach the server");
  }
  return (await response.json()) as HealthStatus;
}

export async function getCurrentUser(accessToken: string): Promise<UserProfile> {
  const response = await fetch(`${apiUrl}/api/user/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Unable to load your profile");

  const body = (await response.json()) as ApiSuccess<UserProfile>;
  return body.data;
}

export async function getStudioRoom(accessToken: string): Promise<StudioRoom | null> {
  const response = await fetch(`${apiUrl}/api/studio/room`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Unable to load your studio room");

  const body = (await response.json()) as ApiSuccess<StudioRoom | null>;
  return body.data;
}

export async function saveStudioRoom(
  accessToken: string,
  snapshot: SaveStudioRoomBody,
): Promise<StudioRoom> {
  const response = await fetch(`${apiUrl}/api/studio/room`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error("Unable to save your studio room");

  const body = (await response.json()) as ApiSuccess<StudioRoom>;
  return body.data;
}
