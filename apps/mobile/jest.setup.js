// Official in-memory mock so AsyncStorage works in tests without the native
// module (the default studio repository reads/writes through it).
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
