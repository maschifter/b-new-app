import { type QueryAuth, queryAuthAtom } from "@bnewapp/mobile-kit";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { type PropsWithChildren, createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

interface AuthSessionContextValue {
  hydrated: boolean;
  session: Session | null;
}

const AuthSessionContext = createContext<AuthSessionContextValue | undefined>(undefined);

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(supabase === null);
  const setQueryAuth = useSetAtom(queryAuthAtom);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;

    const client = supabase;

    // The query layer's view of the current identity. It lags `session` only
    // across a transition, and is the anchor for scoping cache cleanup to the
    // outgoing user so a concurrent sign-in for another user is never wiped.
    let currentUserId: string | null = null;

    // Projects a session into the query layer and drives cache transitions.
    // Same-user token refresh updates the token in place (key/cache preserved);
    // any identity change disables queries, drops only the previous user's
    // cached entries, then enables the next identity. Runs synchronously, so
    // ordered auth events stay serialized and a stale event cannot disable a
    // newer session.
    const applySession = (next: Session | null) => {
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

    // onAuthStateChange delivers events in order (INITIAL_SESSION, then refresh /
    // sign-in / sign-out), so it is the serialized transition stream. getSession
    // is only a fallback for the initial read and is ignored once a live event
    // has already been handled.
    let receivedAuthEvent = false;

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      applySession(nextSession);
      setSession(nextSession);
      setHydrated(true);
    });

    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active || receivedAuthEvent) return;
      applySession(data.session);
      setSession(data.session);
      setHydrated(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient, setQueryAuth]);

  return (
    <AuthSessionContext.Provider value={{ hydrated, session }}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionContextValue {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error("useAuthSession must be used within AuthSessionProvider");
  return value;
}
