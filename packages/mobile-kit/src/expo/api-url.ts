import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { resolveApiUrl } from "../api/api-url";

interface ExpoApiUrlOptions {
  /** The app's own `EXPO_PUBLIC_API_URL`; each app reads its own env. */
  configuredUrl: string | undefined;
  /** The app's dev-server API port, used when no URL is configured. */
  port: number;
}

function metroHost(): string | undefined {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;
  return hostUri?.split(":")[0] || undefined;
}

/**
 * Resolve the API base URL from the running Expo environment. Each app calls this
 * once at bootstrap with its own env value and port, and owns the resulting
 * constant; the package exposes a resolver, never a shared value.
 */
export function resolveExpoApiUrl({ configuredUrl, port }: ExpoApiUrlOptions): string {
  return resolveApiUrl({
    configuredUrl,
    isDevelopment: __DEV__,
    isDevice: Device.isDevice,
    metroHost: metroHost(),
    platform: Platform.OS,
    port,
  });
}
