import { requirePublishedApiUrl, resolveApiUrl, validatePublishedBuildApiUrl } from "../api-url";

describe("resolveApiUrl", () => {
  const baseOptions = {
    isDevelopment: true,
    metroHost: undefined,
    platform: "ios",
    port: 3000,
  };

  it("uses Metro's LAN host for an unconfigured physical-device development bundle", () => {
    expect(
      resolveApiUrl({ ...baseOptions, configuredUrl: undefined, metroHost: "192.168.1.4" }),
    ).toBe("http://192.168.1.4:3000");
  });

  it("rewrites a configured Android emulator localhost URL", () => {
    expect(
      resolveApiUrl({
        ...baseOptions,
        configuredUrl: "http://localhost:3000",
        platform: "android",
      }),
    ).toBe("http://10.0.2.2:3000");
  });

  it("keeps localhost as the fallback when Metro has no host", () => {
    expect(resolveApiUrl({ ...baseOptions, configuredUrl: undefined })).toBe(
      "http://localhost:3000",
    );
  });

  it("requires an HTTPS URL outside development", () => {
    expect(() =>
      resolveApiUrl({ ...baseOptions, configuredUrl: undefined, isDevelopment: false }),
    ).toThrow("EXPO_PUBLIC_API_URL must be set");
    expect(() => requirePublishedApiUrl("http://192.168.1.4:3000")).toThrow("must use HTTPS");
    expect(requirePublishedApiUrl("https://api-staging.example.com")).toBe(
      "https://api-staging.example.com",
    );
  });

  it("validates explicit staging and production build profiles", () => {
    expect(() => validatePublishedBuildApiUrl("staging", undefined)).toThrow(
      "EXPO_PUBLIC_API_URL must be set",
    );
    expect(() => validatePublishedBuildApiUrl("production", "http://api.example.com")).toThrow(
      "must use HTTPS",
    );
    expect(() => validatePublishedBuildApiUrl("development", undefined)).not.toThrow();
  });
});
