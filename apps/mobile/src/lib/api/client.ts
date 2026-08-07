import type { HealthStatus } from "@bnewapp/types";
const apiUrl = process.env.EXPO_PUBLIC_API_URL;

export async function getHealth(): Promise<HealthStatus> {
  if (!apiUrl) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured");
  }
  const response = await fetch(`${apiUrl}/health`);
  if (!response.ok) {
    throw new Error("Unable to reach the server");
  }
  return (await response.json()) as HealthStatus;
}
