import type { DashboardSummary } from "@bnewapp/types";
import simpleRestProvider from "ra-data-simple-rest";
import { fetchUtils } from "react-admin";
import { supabase } from "./supabase-client";

const apiUrl = import.meta.env.VITE_API_URL;
if (!apiUrl) throw new Error("Missing VITE_API_URL — set it in apps/admin/.env.local");

function isUnauthorized(error: unknown): error is { status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 401
  );
}

async function authenticatedFetch(
  url: string,
  options: fetchUtils.Options,
  canRefresh: boolean,
) {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers((options.headers as HeadersInit) ?? undefined);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  try {
    return await fetchUtils.fetchJson(url, { ...options, headers });
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
    if (!canRefresh) {
      await supabase.auth.signOut();
      throw error;
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      await supabase.auth.signOut();
      throw error;
    }
    return authenticatedFetch(url, options, false);
  }
}

export const httpClient = async (url: string, options: fetchUtils.Options = {}) => {
  return authenticatedFetch(url, options, true);
};

export const adminApiUrl = `${apiUrl}/api/admin`;

export const dataProvider = simpleRestProvider(adminApiUrl, httpClient);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDashboardSummary(value: unknown): value is DashboardSummary {
  if (!isRecord(value) || !isRecord(value.users) || !isRecord(value.rooms)) return false;

  return (
    isMetric(value.users.total) &&
    isMetric(value.users.last24h) &&
    isMetric(value.users.last7d) &&
    isMetric(value.users.last30d) &&
    isMetric(value.rooms.total) &&
    isMetric(value.rooms.updatedLast7d)
  );
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const { json } = await httpClient(`${adminApiUrl}/dashboard/summary`);
  const value: unknown = json;
  if (!isDashboardSummary(value)) throw new Error("Invalid dashboard summary response");
  return value;
}
