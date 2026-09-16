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

function configuredApiUrl(configuredUrl: string | undefined): string | undefined {
  const url = configuredUrl?.trim();
  return url || undefined;
}

export function requirePublishedApiUrl(configuredUrl: string | undefined): string {
  const apiUrl = configuredApiUrl(configuredUrl);
  if (!apiUrl) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must be set to an HTTPS URL for staging and production builds.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw new Error("EXPO_PUBLIC_API_URL must be a valid HTTPS URL.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_API_URL must use HTTPS for staging and production builds.");
  }

  return apiUrl;
}

export function validatePublishedBuildApiUrl(
  buildProfile: string | undefined,
  configuredUrl: string | undefined,
): void {
  if (buildProfile === "staging" || buildProfile === "production") {
    requirePublishedApiUrl(configuredUrl);
  }
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
