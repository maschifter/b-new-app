import { createExpoAppConfig } from "@bnewapp/mobile-kit/expo/app-config";

export default createExpoAppConfig({
  name: "BNewApp",
  slug: "bnewapp",
  scheme: "bnewapp",
  version: "0.0.1",
  bundleIdentifier: "com.bnewapp.mobile",
  cameraUsageDescription: "BNewApp uses your camera to record dance attempts for scoring.",
});
