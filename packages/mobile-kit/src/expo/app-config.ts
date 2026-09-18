import { validatePublishedBuildApiUrl } from "@bnewapp/mobile-kit/api-url";
import type { ConfigContext, ExpoConfig } from "expo/config";

type ExpoPlugin = NonNullable<ExpoConfig["plugins"]>[number];

interface ExpoAppConfigOptions {
  /** Product name, before the build-profile suffix. */
  name: string;
  slug: string;
  scheme: string;
  version: string;
  /** Bundle id and Android package, before the build-profile suffix. */
  bundleIdentifier: string;
  /** Why this app films the user, shown in the iOS permission prompt. */
  cameraUsageDescription: string;
  /**
   * Why this app writes a video to the device gallery, shown in the iOS permission
   * prompt. Present only in an app that offers that export: it is what adds
   * `expo-media-library`'s config plugin, so an app that omits it ships neither the
   * permission nor the native module.
   */
  photoLibraryAddUsageDescription?: string | undefined;
}

function buildProfileSuffix(buildProfile: string | undefined): string {
  switch (buildProfile) {
    case "development":
      return ".dev";
    case "staging":
      return ".staging";
    default:
      return "";
  }
}

function displayName(name: string, buildProfile: string | undefined): string {
  switch (buildProfile) {
    case "development":
      return `${name} (Dev)`;
    case "staging":
      return `${name} (Staging)`;
    default:
      return name;
  }
}

/**
 * The Expo config both apps ship, given the handful of values that differ. Everything
 * else — the build-profile naming, the camera permission, the plugin list and the
 * published-URL check — is the same contract for both, so it lives here.
 *
 * Only a real EAS build ships the profile's bundle. `prebuild` runs the staging profile
 * locally to generate the native projects, where .env leaves the API URL unset on
 * purpose so devices reach Metro's LAN host.
 */
export function createExpoAppConfig({
  name,
  slug,
  scheme,
  version,
  bundleIdentifier,
  cameraUsageDescription,
  photoLibraryAddUsageDescription,
}: ExpoAppConfigOptions): (context: ConfigContext) => ExpoConfig {
  const buildProfile = process.env.EAS_BUILD_PROFILE;

  if (process.env.EAS_BUILD === "true") {
    validatePublishedBuildApiUrl(buildProfile, process.env.EXPO_PUBLIC_API_URL);
  }

  const suffix = buildProfileSuffix(buildProfile);
  const appDisplayName = displayName(name, buildProfile);

  // Write only: the app saves a clip to the gallery and never reads it back, so the read
  // prompt is deleted (`false`) rather than left to the plugin's generic default, and
  // Android is narrowed to video from the plugin's photo + video + audio.
  const galleryPlugins: ExpoPlugin[] =
    photoLibraryAddUsageDescription === undefined
      ? []
      : [
          [
            "expo-media-library",
            {
              photosPermission: false,
              savePhotosPermission: photoLibraryAddUsageDescription,
              isAccessMediaLocationEnabled: false,
              granularPermissions: ["video"],
            },
          ],
        ];

  return ({ config }: ConfigContext): ExpoConfig => ({
    ...config,
    name: appDisplayName,
    slug,
    version,
    scheme,
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: false,
      bundleIdentifier: `${bundleIdentifier}${suffix}`,
      infoPlist: {
        CFBundleDisplayName: appDisplayName,
        NSCameraUsageDescription: cameraUsageDescription,
      },
    },
    android: {
      package: `${bundleIdentifier}${suffix}`,
      permissions: ["android.permission.CAMERA"],
    },
    // SDK 55 requires an explicit config-plugin entry for expo-image; edge-to-edge
    // is mandatory from this SDK on, so the former `android.edgeToEdgeEnabled` key
    // no longer exists in the config schema.
    plugins: [
      "expo-router",
      "expo-image",
      // Playback only: both recorders capture video with audio disabled, so the
      // plugin's default microphone permission and background services are opted out.
      ["expo-audio", { recordAudioAndroid: false, enableBackgroundPlayback: false }],
      ...galleryPlugins,
      "@bnewapp/mobile-kit/config-plugins/with-ios-min-deployment-target",
    ],
    experiments: { typedRoutes: true },
  });
}
