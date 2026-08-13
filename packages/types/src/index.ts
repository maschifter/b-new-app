import type { DecorationSnapshot } from "@bnewapp/studio-core";

export type { Database } from "./database.generated.js";

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface HealthStatus {
  status: "ok";
  timestamp: string;
}

export interface UserProfile {
  createdAt: string;
  id: string;
  email: string;
}

/** A user's persisted studio room as returned by the API. */
export interface StudioRoom {
  id: string;
  ownerId: string;
  snapshot: DecorationSnapshot;
  updatedAt: string;
}

/** Body for PUT /api/studio/room — the full decoration snapshot to persist. */
export type SaveStudioRoomBody = DecorationSnapshot;

/**
 * A room in the Explore feed. Omits StudioRoom.id because the schema has one
 * room per owner and ownerId is the public stable key. `username` is a non-null
 * database invariant, so it is always present.
 */
export type ExploreRoom = Omit<StudioRoom, "id"> & {
  username: string;
};

/** Keyset cursor for the Explore feed, ordered by (updatedAt desc, id desc). */
export interface ExploreRoomsCursor {
  updatedAt: string;
  id: string;
}

/** A page of Explore rooms with the cursor to fetch the next page, if any. */
export interface ExploreRoomsPage {
  items: ExploreRoom[];
  nextCursor: ExploreRoomsCursor | null;
}
