import type { ApiSuccess } from "@bnewapp/types";

// Bearer auth header for authenticated requests. Feature api modules reuse this
// instead of re-spelling the `Bearer ${accessToken}` template per call.
export function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

// Auth header plus JSON content type for requests that send a body.
export function jsonHeaders(accessToken: string): Record<string, string> {
  return { ...authHeaders(accessToken), "Content-Type": "application/json" };
}

function envelopeData(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("data" in body)) {
    throw new Error("Invalid API response");
  }
  return body.data;
}

async function failureMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
    ) {
      return body.message;
    }
  } catch {
    // A non-JSON failure body carries nothing worth showing; use the fallback.
  }
  return fallback;
}

interface UnwrapApiSuccessOptions<T> {
  /** Validate `data` at the boundary instead of trusting the declared type. */
  parse?: (value: unknown) => T;
  /** Raise the server's own `{ message }` when it sent one, for an actionable failure. */
  serverError?: boolean;
}

// Unwrap the shared `ApiSuccess<T>` envelope, throwing `errorMessage` on a non-2xx
// response. See CLAUDE.md §6 for when an endpoint needs `parse` or `serverError`.
export async function unwrapApiSuccess<T>(
  response: Response,
  errorMessage: string,
  { parse, serverError = false }: UnwrapApiSuccessOptions<T> = {},
): Promise<T> {
  if (!response.ok) {
    throw new Error(serverError ? await failureMessage(response, errorMessage) : errorMessage);
  }
  const body = (await response.json()) as ApiSuccess<T>;
  return parse ? parse(envelopeData(body)) : body.data;
}
