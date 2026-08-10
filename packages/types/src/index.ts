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
