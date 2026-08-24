import { apiUrl } from "@/lib/api/client";
import type { StudioCatalogResponse } from "@bnewapp/types";

export async function getCatalog(accessToken: string) {
  const response = await fetch(`${apiUrl}/api/studio/catalog`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Unable to load the studio catalog");

  const body = (await response.json()) as StudioCatalogResponse;
  return body.data;
}
