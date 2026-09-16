import { validatePublishedBuildApiUrl } from "@bnewapp/mobile-kit/api-url";
import type { ConfigContext, ExpoConfig } from "expo/config";

const APP_NAME = "Stepz";
const BUILD_PROFILE = process.env.EAS_BUILD_PROFILE;

// Only a real EAS build ships the profile's bundle. `prebuild` runs the staging
// profile locally to generate the native projects, where .env leaves the API URL
// unset on purpose so devices reach Metro's LAN host.
if (process.env.EAS_BUILD === "true") {
  validatePublishedBuildApiUrl(BUILD_PROFILE, process.env.EXPO_PUBLIC_API_URL);
}

const BUNDLE_ID_SUFFIX = (() => {
  switch (BUILD_PROFILE) {
    case "development":
      return ".dev";
    case "staging":
      return ".staging";
    default:
      return "";
  }
})();

const APP_DISPLAY_NAME = (() => {
  switch (BUILD_PROFILE) {
    case "development":
      return `${APP_NAME} (Dev)`;
    case "staging":
      return `${APP_NAME} (Staging)`;
    default:
      return APP_NAME;
  }
})();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_DISPLAY_NAME,
  slug: "stepz",
  version: "0.0.1",
  scheme: "stepz",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: false,
    bundleIdentifier: `com.bnewapp.stepz${BUNDLE_ID_SUFFIX}`,
    infoPlist: {
      CFBundleDisplayName: APP_DISPLAY_NAME,
      NSCameraUsageDescription:
        "Stepz uses your camera to scan your movement and calculate a score for the move you are learning.",
    },
  },
  android: {
    package: `com.bnewapp.stepz${BUNDLE_ID_SUFFIX}`,
    permissions: ["android.permission.CAMERA"],
  },
  // SDK 55 requires an explicit config-plugin entry for expo-image; edge-to-edge
  // is mandatory from this SDK on, so the former `android.edgeToEdgeEnabled` key
  // no longer exists in the config schema.
  plugins: [
    "expo-router",
    "expo-image",
    // Playback only: the scan recorder captures video with audio disabled, so the
    // plugin's default microphone permission and background services are opted out.
    ["expo-audio", { recordAudioAndroid: false, enableBackgroundPlayback: false }],
    "@bnewapp/mobile-kit/config-plugins/with-ios-min-deployment-target",
  ],
  experiments: { typedRoutes: true },
});
