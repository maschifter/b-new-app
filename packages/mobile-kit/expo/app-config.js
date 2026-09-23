const { validatePublishedBuildApiUrl } = require("../api/published-api-url");

/**
 * @typedef {import("expo/config").ConfigContext} ConfigContext
 * @typedef {import("expo/config").ExpoConfig} ExpoConfig
 * @typedef {NonNullable<ExpoConfig["plugins"]>[number]} ExpoPlugin
 * @typedef {import("./app-config.d.ts").ExpoAppConfigOptions} ExpoAppConfigOptions
 */

/**
 * @param {string | undefined} buildProfile
 * @returns {string}
 */
function buildProfileSuffix(buildProfile) {
  switch (buildProfile) {
    case "development":
      return ".dev";
    case "staging":
      return ".staging";
    default:
      return "";
  }
}

/**
 * @param {string} name
 * @param {string | undefined} buildProfile
 * @returns {string}
 */
function displayName(name, buildProfile) {
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
 * Plain CommonJS on purpose: Expo's config loader transpiles the `app.config.ts` entry
 * alone and requires whatever it imports untransformed, so this module and everything it
 * reaches must be loadable by Node as-is. `app-config.d.ts` carries its types.
 *
 * Only a real EAS build ships the profile's bundle. `prebuild` runs the staging profile
 * locally to generate the native projects, where .env leaves the API URL unset on
 * purpose so devices reach Metro's LAN host.
 *
 * @param {ExpoAppConfigOptions} options
 * @returns {(context: ConfigContext) => ExpoConfig}
 */
function createExpoAppConfig({
  name,
  slug,
  scheme,
  version,
  bundleIdentifier,
  cameraUsageDescription,
  photoLibraryAddUsageDescription,
  plugins,
}) {
  const buildProfile = process.env.EAS_BUILD_PROFILE;

  if (process.env.EAS_BUILD === "true") {
    validatePublishedBuildApiUrl(buildProfile, process.env.EXPO_PUBLIC_API_URL);
  }

  const suffix = buildProfileSuffix(buildProfile);
  const appDisplayName = displayName(name, buildProfile);

  // Write only: the app saves a clip to the gallery and never reads it back, so the read
  // prompt is deleted (`false`) rather than left to the plugin's generic default, and
  // Android is narrowed to video from the plugin's photo + video + audio.
  /** @type {ExpoPlugin[]} */
  const galleryPlugins =
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

  return ({ config }) => ({
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
      ...(plugins ?? []),
    ],
    experiments: { typedRoutes: true },
  });
}

module.exports = { createExpoAppConfig };
