import { defineConfig } from "vitest/config";

// Pure-TS domain package: scoring, status, and Record-screen timing rules shared
// by the server worker and the mobile app. Jest-style globals enabled.
export default defineConfig({
  test: { globals: true },
});
