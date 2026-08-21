import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchJson = vi.fn();
const getSession = vi.fn();
const refreshSession = vi.fn();
const signOut = vi.fn();

vi.mock("react-admin", () => ({ fetchUtils: { fetchJson } }));
vi.mock("ra-data-simple-rest", () => ({ default: vi.fn(() => ({})) }));
vi.mock("./supabase-client", () => ({
  supabase: { auth: { getSession, refreshSession, signOut } },
}));

function unauthorized() {
  return Object.assign(new Error("Unauthorized"), { status: 401 });
}

describe("admin HTTP client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_API_URL", "http://localhost:3000");
  });

  it("refreshes an expired session and retries the request once", async () => {
    getSession
      .mockResolvedValueOnce({ data: { session: { access_token: "expired-token" } } })
      .mockResolvedValueOnce({ data: { session: { access_token: "fresh-token" } } });
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "fresh-token" } },
      error: null,
    });
    fetchJson
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValueOnce({ json: { id: "user-1" } });

    const { httpClient } = await import("./data-provider");
    await expect(httpClient("http://localhost:3000/api/admin/users/user-1")).resolves.toEqual({
      json: { id: "user-1" },
    });

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(fetchJson.mock.calls[0]?.[1].headers.get("Authorization")).toBe(
      "Bearer expired-token",
    );
    expect(fetchJson.mock.calls[1]?.[1].headers.get("Authorization")).toBe("Bearer fresh-token");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out instead of retrying indefinitely when the refreshed token is rejected", async () => {
    getSession
      .mockResolvedValueOnce({ data: { session: { access_token: "expired-token" } } })
      .mockResolvedValueOnce({ data: { session: { access_token: "rejected-token" } } });
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "rejected-token" } },
      error: null,
    });
    fetchJson.mockRejectedValue(unauthorized());

    const { httpClient } = await import("./data-provider");
    await expect(httpClient("http://localhost:3000/api/admin/users")).rejects.toMatchObject({
      status: 401,
    });

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("validates and returns the dashboard summary", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "valid-token" } } });
    fetchJson.mockResolvedValue({
      json: {
        users: { total: 40, last24h: 2, last7d: 8, last30d: 20 },
        rooms: { total: 15, updatedLast7d: 7 },
      },
    });

    const { fetchDashboardSummary } = await import("./data-provider");

    await expect(fetchDashboardSummary()).resolves.toEqual({
      users: { total: 40, last24h: 2, last7d: 8, last30d: 20 },
      rooms: { total: 15, updatedLast7d: 7 },
    });
  });

  it("rejects a malformed dashboard summary", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "valid-token" } } });
    fetchJson.mockResolvedValue({
      json: {
        users: { total: 40, last24h: 2, last7d: 8 },
        rooms: { total: 15, updatedLast7d: 7 },
      },
    });

    const { fetchDashboardSummary } = await import("./data-provider");

    await expect(fetchDashboardSummary()).rejects.toThrow("Invalid dashboard summary response");
  });
});
