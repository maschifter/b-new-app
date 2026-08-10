/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.after-env.js"],
  // Resolve the shared domain package to its TypeScript source so babel-jest
  // transforms it (the file sits outside node_modules, so jest-expo's
  // transformIgnorePatterns won't skip it) — no dist build needed for tests.
  moduleNameMapper: {
    "^@bnewapp/studio-core$": "<rootDir>/../../packages/studio-core/src/index.ts",
  },
};
