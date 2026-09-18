import { createExpoAppConfig } from "@bnewapp/mobile-kit/expo/app-config";

export default createExpoAppConfig({
  name: "Stepz",
  slug: "stepz",
  scheme: "stepz",
  version: "0.0.1",
  bundleIdentifier: "com.bnewapp.stepz",
  cameraUsageDescription:
    "Stepz uses your camera to scan your movement and calculate a score for the move you are learning.",
  photoLibraryAddUsageDescription:
    "Stepz saves a copy of your dance video to your gallery when you tap Download.",
});
