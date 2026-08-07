import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Dance",
  slug: "bnewapp",
  version: "0.0.1",
  scheme: "bnewapp",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: { supportsTablet: false, bundleIdentifier: "com.bnewapp.mobile" },
  android: { package: "com.bnewapp.mobile", edgeToEdgeEnabled: true },
  plugins: ["expo-router"],
  experiments: { typedRoutes: true },
});
