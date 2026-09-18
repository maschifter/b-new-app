import type { ConfigContext, ExpoConfig } from "expo/config";

/** Mirrors `app-config.js`, the Expo config both apps build from. */
export interface ExpoAppConfigOptions {
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

export declare function createExpoAppConfig(
  options: ExpoAppConfigOptions,
): (context: ConfigContext) => ExpoConfig;
