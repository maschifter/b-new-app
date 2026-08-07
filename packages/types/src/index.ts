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
