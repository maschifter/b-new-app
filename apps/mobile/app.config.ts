import type { ConfigContext, ExpoConfig } from "expo/config";

const APP_NAME = "BNewApp";

const BUNDLE_ID_SUFFIX = (() => {
  switch (process.env.EAS_BUILD_PROFILE) {
    case "development":
      return ".dev";
    case "staging":
      return ".staging";
    default:
      return "";
  }
})();

const APP_DISPLAY_NAME = (() => {
  switch (process.env.EAS_BUILD_PROFILE) {
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
  slug: "bnewapp",
  version: "0.0.1",
  scheme: "bnewapp",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: false,
    bundleIdentifier: `com.bnewapp.mobile${BUNDLE_ID_SUFFIX}`,
    infoPlist: { CFBundleDisplayName: APP_DISPLAY_NAME },
  },
  android: {
    package: `com.bnewapp.mobile${BUNDLE_ID_SUFFIX}`,
  },
  // SDK 55 requires an explicit config-plugin entry for expo-image; edge-to-edge
  // is mandatory from this SDK on, so the former `android.edgeToEdgeEnabled` key
  // no longer exists in the config schema.
  plugins: ["expo-router", "expo-image"],
  experiments: { typedRoutes: true },
});
