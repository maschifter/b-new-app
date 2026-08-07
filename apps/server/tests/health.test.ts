import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("health endpoint", () => {
  it("returns a healthy status", async () => {
    const app = await buildApp({
      NODE_ENV: "test",
      PORT: 3000,
      HOST: "127.0.0.1",
      LOG_LEVEL: "fatal",
      RATE_LIMIT_MAX: 120,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "test-secret-key",
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
    await app.close();
  });

  it("allows configured origins outside development", async () => {
    const app = await buildApp({
      NODE_ENV: "production",
      PORT: 3000,
      HOST: "127.0.0.1",
      LOG_LEVEL: "fatal",
      ALLOWED_ORIGINS: "https://app.example.com",
      RATE_LIMIT_MAX: 120,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "test-secret-key",
    });
    const response = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "GET",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://app.example.com");
    await app.close();
  });
});
