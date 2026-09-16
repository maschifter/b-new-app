const { mobileKitJestConfig } = require("@bnewapp/mobile-kit/testing/jest/config");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  ...mobileKitJestConfig,
  // Resolve the shared domain package to its TypeScript source so babel-jest
  // transforms it (the file sits outside node_modules, so jest-expo's
  // transformIgnorePatterns won't skip it) — no dist build needed for tests.
  moduleNameMapper: {
    ...mobileKitJestConfig.moduleNameMapper,
    "^@bnewapp/studio-core$": "<rootDir>/../../packages/studio-core/src/index.ts",
  },
};
