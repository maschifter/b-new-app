import { apiUrl, authHeaders, jsonHeaders, unwrapApiSuccess } from "@/lib/api/client";
import type { SaveStudioRoomBody, StudioRoom, StudioRoomWithVisitorCount } from "@bnewapp/types";

export async function getStudioRoom(
  accessToken: string,
): Promise<StudioRoomWithVisitorCount | null> {
  const response = await fetch(`${apiUrl}/api/studio/room`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<StudioRoomWithVisitorCount | null>(
    response,
    "Unable to load your studio room",
  );
}

export async function saveStudioRoom(
  accessToken: string,
  snapshot: SaveStudioRoomBody,
): Promise<StudioRoom> {
  const response = await fetch(`${apiUrl}/api/studio/room`, {
    method: "PUT",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(snapshot),
  });
  return unwrapApiSuccess<StudioRoom>(response, "Unable to save your studio room");
}
