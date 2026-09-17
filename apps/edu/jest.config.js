const { mobileKitJestConfig } = require("@bnewapp/mobile-kit/testing/jest/config");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  ...mobileKitJestConfig,
  // This app is the first gesture-handler consumer in the repository, so its own
  // mocks are appended here rather than in the shared harness.
  setupFiles: [
    ...mobileKitJestConfig.setupFiles,
    require.resolve("react-native-gesture-handler/jestSetup"),
  ],
};
