import type { QueryClient } from "@tanstack/react-query";
import type { QueryAuth } from "./query-auth-atom";

/**
 * The shape of a Supabase `Session` this projection reads, declared structurally so
 * the package stays off the `@supabase/supabase-js` dependency.
 */
export interface ProjectableSession {
  user: { id: string };
  access_token: string;
}

interface QueryAuthProjectionOptions {
  setQueryAuth: (auth: QueryAuth | null) => void;
  queryClient: QueryClient;
}

/**
 * Builds the function an app's session provider calls for every auth event.
 *
 * Same-user token refresh updates the token in place, so the query key and the cache
 * are preserved. Any identity change disables queries, drops only the outgoing user's
 * cached entries, then enables the next identity — cleanup is anchored on the closed
 * over `currentUserId` rather than the incoming one, so a concurrent sign-in for
 * another user is never wiped.
 *
 * Every call runs synchronously, which keeps ordered auth events serialized: a stale
 * event cannot disable a newer session.
 *
 * Cache entries are matched at `queryKey[1]`, the position CLAUDE.md §6 reserves for
 * `userId` in every user-scoped key.
 */
export function createQueryAuthProjection({
  setQueryAuth,
  queryClient,
}: QueryAuthProjectionOptions): (next: ProjectableSession | null) => void {
  // Lags the provider's `session` only across a transition; it is the outgoing
  // identity for as long as the cleanup below needs it.
  let currentUserId: string | null = null;

  return (next) => {
    const nextUserId = next?.user.id ?? null;
    const accessToken = next?.access_token ?? null;
    const nextAuth: QueryAuth | null =
      nextUserId && accessToken ? { userId: nextUserId, accessToken } : null;

    if (nextUserId !== null && nextUserId === currentUserId) {
      setQueryAuth(nextAuth);
      return;
    }

    setQueryAuth(null);
    if (currentUserId !== null) {
      const outgoing = currentUserId;
      const filter = {
        predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === outgoing,
      };
      void queryClient.cancelQueries(filter);
      queryClient.removeQueries(filter);
    }
    currentUserId = nextUserId;
    setQueryAuth(nextAuth);
  };
}
