/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.after-env.js"],
  // Resolve the shared domain package to its TypeScript source so babel-jest
  // transforms it (the file sits outside node_modules, so jest-expo's
  // transformIgnorePatterns won't skip it) — no dist build needed for tests.
  moduleNameMapper: {
    "\\.css$": "<rootDir>/jest.style-mock.js",
    "^@bnewapp/studio-core$": "<rootDir>/../../packages/studio-core/src/index.ts",
  },
  // Mirrors jest-expo's default allowlist plus jotai-tanstack-query, whose
  // published entry is ESM and is reached through its top-level symlink (so the
  // preset's `.pnpm` allowance doesn't cover it). Keep the reanimated entry.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|jotai-tanstack-query|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
};
