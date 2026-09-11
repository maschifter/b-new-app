import { apiUrl, authHeaders, unwrapApiSuccess } from "@/lib/api/client";
import type { StudioCatalog } from "@bnewapp/types";

export async function getCatalog(accessToken: string) {
  const response = await fetch(`${apiUrl}/api/studio/catalog`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<StudioCatalog>(response, "Unable to load the studio catalog");
}
