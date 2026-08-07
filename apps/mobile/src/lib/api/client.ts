import type { HealthStatus } from "@bnewapp/types";
import Constants from "expo-constants";

const apiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;

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
