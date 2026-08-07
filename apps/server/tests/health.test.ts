import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { userRoutes } from "../src/modules/user/routes.js";

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

describe("current user endpoint", () => {
  it("rejects requests without an access token", async () => {
    const app = await buildApp({
      NODE_ENV: "test",
      PORT: 3000,
      HOST: "127.0.0.1",
      LOG_LEVEL: "fatal",
      RATE_LIMIT_MAX: 120,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "test-secret-key",
    });
    const response = await app.inject({ method: "GET", url: "/api/user/me" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns the authenticated user's profile", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { created_at: "2026-08-07T00:00:00.000Z", email: "dancer@example.com", id: "user-1" },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    let handler: ((request: { user: { sub: string } }) => Promise<unknown>) | undefined;
    const app = {
      authenticate: vi.fn(),
      get: vi.fn(
        (
          _path: string,
          _options: unknown,
          routeHandler: (request: { user: { sub: string } }) => Promise<unknown>,
        ) => {
          handler = routeHandler;
        },
      ),
      httpErrors: {
        internalServerError: (message: string) => new Error(message),
        notFound: (message: string) => new Error(message),
      },
      supabase: { from: vi.fn().mockReturnValue({ select }) },
    };
    await userRoutes(app as never);

    if (!handler) throw new Error("User route handler was not registered");
    const response = await handler({ user: { sub: "user-1" } });

    expect(app.get).toHaveBeenCalledWith(
      "/me",
      { preHandler: app.authenticate },
      expect.any(Function),
    );
    expect(response).toEqual({
      data: { createdAt: "2026-08-07T00:00:00.000Z", email: "dancer@example.com", id: "user-1" },
    });
    expect(eq).toHaveBeenCalledWith("id", "user-1");
  });
});
