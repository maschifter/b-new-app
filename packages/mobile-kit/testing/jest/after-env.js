// Runs after the test framework is set up, so `beforeEach` is available here.
// Wipe the in-memory MMKV mock before every test so persisted studio state
// never leaks from one test into the next.
beforeEach(() => {
  const { __resetAllMMKV } = require("react-native-mmkv");
  __resetAllMMKV?.();
});
