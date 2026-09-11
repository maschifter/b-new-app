import { apiUrl, authHeaders, unwrapApiSuccess } from "@/lib/api/client";
import type { ExploreRoomsCursor, ExploreRoomsPage, VisitedStudioRoom } from "@bnewapp/types";

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
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<ExploreRoomsPage>(response, "Unable to load studios");
}

// Record a visit to another user's room, then return its read-only detail.
// Returns `null` when the owner has no room.
export async function visitExploreRoom(
  accessToken: string,
  ownerId: string,
): Promise<VisitedStudioRoom | null> {
  const response = await fetch(`${apiUrl}/api/studio/rooms/${ownerId}/visits`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<VisitedStudioRoom | null>(response, "Unable to load this studio");
}
