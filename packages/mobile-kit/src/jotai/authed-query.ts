import type { Getter } from "jotai";
import { type QueryAuth, queryAuthAtom } from "../auth/query-auth-atom";
import { queryErrorResetVersionAtom } from "../react-query/query-error-reset";

interface ReadQueryAuthOptions {
  /**
   * Re-read the atom when the query error boundary resets, so its retry action
   * re-runs the query. Pass `false` for an atom that never throws to the boundary,
   * or one sharing a query key with a twin that already subscribes.
   */
  errorBoundaryReset?: boolean;
}

/** Read the auth projection a query atom scopes its cache and requests by. */
export function readQueryAuth(get: Getter, options: ReadQueryAuthOptions = {}): QueryAuth | null {
  if (options.errorBoundaryReset !== false) get(queryErrorResetVersionAtom);
  return get(queryAuthAtom);
}

/** Authorize a request whose atom only runs while signed in. */
export function requireAuth(auth: QueryAuth | null): QueryAuth {
  if (!auth) throw new Error("Not authenticated");
  return auth;
}
