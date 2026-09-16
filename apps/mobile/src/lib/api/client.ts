import { resolveExpoApiUrl } from "@bnewapp/mobile-kit/expo";

const API_PORT = 3000;

// Resolved once at module load. Exported so feature-local api modules build their
// request URLs off the same base without re-resolving the Metro/env host.
export const apiUrl = resolveExpoApiUrl({
  configuredUrl: process.env.EXPO_PUBLIC_API_URL,
  port: API_PORT,
});

export { authHeaders, jsonHeaders, unwrapApiSuccess } from "@bnewapp/mobile-kit";
