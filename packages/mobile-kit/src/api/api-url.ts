import {
  configuredApiUrl,
  requirePublishedApiUrl,
  validatePublishedBuildApiUrl,
} from "../../api/published-api-url";

export { requirePublishedApiUrl, validatePublishedBuildApiUrl };

interface ResolveApiUrlOptions {
  configuredUrl: string | undefined;
  isDevelopment: boolean;
  isDevice: boolean;
  metroHost: string | undefined;
  platform: string;
  port: number;
}

function rewriteAndroidLocalhost(url: string, platform: string, isDevice: boolean): string {
  return platform === "android" && !isDevice
    ? url.replace(/\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, "//10.0.2.2")
    : url;
}

export function resolveApiUrl({
  configuredUrl,
  isDevelopment,
  isDevice,
  metroHost,
  platform,
  port,
}: ResolveApiUrlOptions): string {
  const apiUrl = configuredApiUrl(configuredUrl);

  if (!isDevelopment) {
    return requirePublishedApiUrl(apiUrl);
  }

  if (apiUrl) return rewriteAndroidLocalhost(apiUrl, platform, isDevice);

  const defaultApiUrl = `http://localhost:${port}`;
  return rewriteAndroidLocalhost(
    metroHost ? `http://${metroHost}:${port}` : defaultApiUrl,
    platform,
    isDevice,
  );
}
