import { apiUrl } from "@/lib/api/client";
import type { ApiSuccess, ExploreRoom, ExploreRoomsCursor, ExploreRoomsPage } from "@bnewapp/types";

interface GetExploreRoomsParams {
  limit?: number;
  cursor?: ExploreRoomsCursor | null;
}

// One page of other users' rooms. The cursor is opaque server state (a keyset
// boundary); pass back whatever the previous page returned as `nextCursor`.
export async function getExploreRooms(
  accessToken: string,
  { limit, cursor }: GetExploreRoomsParams = {},
): Promise<ExploreRoomsPage> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (cursor) {
    params.set("cursorUpdatedAt", cursor.updatedAt);
    params.set("cursorId", cursor.id);
  }
  const query = params.toString();
  const response = await fetch(`${apiUrl}/api/studio/rooms${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Unable to load studios");

  const body = (await response.json()) as ApiSuccess<ExploreRoomsPage>;
  return body.data;
}

// A single other user's room, read-only. `null` when the owner has no room.
export async function getExploreRoom(
  accessToken: string,
  ownerId: string,
): Promise<ExploreRoom | null> {
  const response = await fetch(`${apiUrl}/api/studio/rooms/${ownerId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Unable to load this studio");

  const body = (await response.json()) as ApiSuccess<ExploreRoom | null>;
  return body.data;
}
