import { defineConfig } from "vitest/config";

// Pure-TS domain package: run the moved studio tests with vitest (jest-style
// globals enabled so the test bodies read the same as when they lived in the
// mobile app under jest).
export default defineConfig({
  test: { globals: true },
});
