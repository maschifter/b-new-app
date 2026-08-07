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
  id: string;
  email: string | null;
}
