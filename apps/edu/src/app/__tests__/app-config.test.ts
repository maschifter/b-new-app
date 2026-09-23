import appConfig from "../../../app.config";
import type { ConfigContext } from "expo/config";

it("appends Stepz's embedded Slackey face after the shared plugin contract", () => {
  const context: ConfigContext = {
    projectRoot: "/app",
    staticConfigPath: null,
    packageJsonPath: null,
    config: {},
  };
  const config = appConfig(context);

  expect(config.plugins).toEqual([
    "expo-router",
    "expo-image",
    ["expo-audio", { recordAudioAndroid: false, enableBackgroundPlayback: false }],
    [
      "expo-media-library",
      {
        photosPermission: false,
        savePhotosPermission: "Stepz saves a copy of your dance video to your gallery when you tap Download.",
        isAccessMediaLocationEnabled: false,
        granularPermissions: ["video"],
      },
    ],
    "@bnewapp/mobile-kit/config-plugins/with-ios-min-deployment-target",
    "@bnewapp/mobile-kit/config-plugins/with-ios-27-scene-lifecycle",
    ["expo-font", { fonts: ["./assets/fonts/Slackey-Regular.ttf"] }],
  ]);
});
