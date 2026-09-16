import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { resolveExpoApiUrl } from "../api-url";

jest.mock("expo-constants", () => ({ __esModule: true, default: {} }));
jest.mock("expo-device", () => ({ isDevice: true }));

const constants = Constants as unknown as {
  expoConfig: { hostUri: string } | undefined;
  expoGoConfig: { debuggerHost: string } | undefined;
};
const device = Device as unknown as { isDevice: boolean };

beforeEach(() => {
  constants.expoConfig = undefined;
  constants.expoGoConfig = undefined;
  device.isDevice = true;
  Platform.OS = "ios";
});

it("takes the Metro host from the dev-client's hostUri", () => {
  constants.expoConfig = { hostUri: "192.168.1.4:8081" };

  expect(resolveExpoApiUrl({ configuredUrl: undefined, port: 3000 })).toBe(
    "http://192.168.1.4:3000",
  );
});

it("falls back to Expo Go's debuggerHost when there is no hostUri", () => {
  constants.expoGoConfig = { debuggerHost: "10.1.2.3:8081" };

  expect(resolveExpoApiUrl({ configuredUrl: undefined, port: 3000 })).toBe("http://10.1.2.3:3000");
});

it("falls back to localhost when Expo reports no host at all", () => {
  expect(resolveExpoApiUrl({ configuredUrl: undefined, port: 4000 })).toBe("http://localhost:4000");
});

it("rewrites localhost for the Android emulator but not for a physical device", () => {
  Platform.OS = "android";
  device.isDevice = false;
  expect(resolveExpoApiUrl({ configuredUrl: "http://localhost:3000", port: 3000 })).toBe(
    "http://10.0.2.2:3000",
  );

  device.isDevice = true;
  expect(resolveExpoApiUrl({ configuredUrl: "http://localhost:3000", port: 3000 })).toBe(
    "http://localhost:3000",
  );
});

it("prefers the configured URL over the Metro host", () => {
  constants.expoConfig = { hostUri: "192.168.1.4:8081" };

  expect(resolveExpoApiUrl({ configuredUrl: "http://api.test:3000", port: 3000 })).toBe(
    "http://api.test:3000",
  );
});
