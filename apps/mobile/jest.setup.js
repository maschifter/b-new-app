// Official in-memory mock so AsyncStorage works in tests without the native
// module (the default studio repository reads/writes through it).
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Worklets' official mock. Required from react-native-worklets 0.7 on: its
// NativeWorklets module is constructed at import time and now throws when the
// native part is absent ("Native part of Worklets doesn't seem to be
// initialized"), which is always the case under jest. Reanimated imports
// worklets transitively, so mocking it here is what keeps `react-native-
// reanimated` importable — the reanimated JS layer itself stays real.
jest.mock("react-native-worklets", () =>
  require("react-native-worklets/lib/module/mock"),
);
