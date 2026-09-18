// The jest harness both apps and this package share. Every path is resolved from
// this file, not from `<rootDir>`, because `<rootDir>` is the consuming project.
// Spread beside `preset: "jest-expo"` — jest's `preset` key is singular, so this
// cannot itself be a preset.
const mobileKitJestConfig = {
  setupFiles: [
    require.resolve("./setup.js"),
    // Both apps and this package render the tempo bar, so the gesture mocks belong
    // to the shared harness rather than to one consumer.
    require.resolve("react-native-gesture-handler/jestSetup"),
  ],
  setupFilesAfterEnv: [require.resolve("./after-env.js")],
  moduleNameMapper: {
    ".css$": require.resolve("./style-mock.js"),
  },
  // Mirrors jest-expo's default allowlist plus jotai-tanstack-query, whose
  // published entry is ESM and is reached through its top-level symlink (so the
  // preset's `.pnpm` allowance doesn't cover it). Keep the reanimated entry.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|jotai-tanstack-query|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
};

module.exports = { mobileKitJestConfig };
