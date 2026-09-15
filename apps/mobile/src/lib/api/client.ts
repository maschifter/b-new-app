import type { ApiSuccess } from "@bnewapp/types";
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

function envelopeData(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("data" in body)) {
    throw new Error("Invalid API response");
  }
  return body.data;
}

async function failureMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
    ) {
      return body.message;
    }
  } catch {
    // A non-JSON failure body carries nothing worth showing; use the fallback.
  }
  return fallback;
}

interface UnwrapApiSuccessOptions<T> {
  /** Validate `data` at the boundary instead of trusting the declared type. */
  parse?: (value: unknown) => T;
  /** Raise the server's own `{ message }` when it sent one, for an actionable failure. */
  serverError?: boolean;
}

// Unwrap the shared `ApiSuccess<T>` envelope, throwing `errorMessage` on a non-2xx
// response. See CLAUDE.md §6 for when an endpoint needs `parse` or `serverError`.
export async function unwrapApiSuccess<T>(
  response: Response,
  errorMessage: string,
  { parse, serverError = false }: UnwrapApiSuccessOptions<T> = {},
): Promise<T> {
  if (!response.ok) {
    throw new Error(serverError ? await failureMessage(response, errorMessage) : errorMessage);
  }
  const body = (await response.json()) as ApiSuccess<T>;
  return parse ? parse(envelopeData(body)) : body.data;
}
