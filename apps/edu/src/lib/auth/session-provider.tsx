import { type QueryAuth, queryAuthAtom } from "@bnewapp/mobile-kit";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "./supabase";

/** `pending` covers the bootstrap; `unavailable` means no identity, with a retry offered. */
type AnonymousSessionStatus = "pending" | "ready" | "unavailable";

interface AnonymousSessionContextValue {
  status: AnonymousSessionStatus;
  session: Session | null;
  retry: () => void;
}

const AnonymousSessionContext = createContext<AnonymousSessionContextValue | undefined>(undefined);

/**
 * Supabase warns against calling auth methods from inside `onAuthStateChange`, so
 * the sign-in is always driven from outside it. Success arrives back through that
 * subscription; only the failure is reported here.
 */
async function startAnonymousSession(client: SupabaseClient, onFailure: () => void): Promise<void> {
  const { error } = await client.auth.signInAnonymously();
  if (error) onFailure();
}

/**
 * Stepz has no sign-up and no login: the device gets an anonymous Supabase identity
 * on first launch and keeps it in AsyncStorage. The JWT exists only so the shared
 * owner-scoped dance API can be reused unchanged — the user never sees an account,
 * and no local profile data is keyed by it.
 */
export function AnonymousSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AnonymousSessionStatus>(
    supabase === null ? "unavailable" : "pending",
  );
  const setQueryAuth = useSetAtom(queryAuthAtom);
  const queryClient = useQueryClient();

  const retry = useCallback(() => {
    if (!supabase) return;
    setStatus("pending");
    void startAnonymousSession(supabase, () => setStatus("unavailable"));
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const client = supabase;

    // The query layer's view of the current identity. It lags `session` only across
    // a transition, and is the anchor for scoping cache cleanup to the outgoing
    // identity. A lost anonymous session is replaced by a *different* anonymous
    // user, so that transition is real here, not hypothetical.
    let currentUserId: string | null = null;

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

    let active = true;
    let receivedAuthEvent = false;
    // Separates "still bootstrapping" from "had an identity and lost it". The second
    // is a dead end without a retry, so it must not sit on the spinner.
    let everReady = false;

    const settle = (next: Session | null) => {
      setSession(next);
      if (next) {
        everReady = true;
        setStatus("ready");
      } else if (everReady) {
        setStatus("unavailable");
      }
    };

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      applySession(nextSession);
      if (active) settle(nextSession);
    });

    void (async () => {
      const { data, error } = await client.auth.getSession();
      if (!active) return;
      if (error) {
        setStatus("unavailable");
        return;
      }
      if (!receivedAuthEvent) {
        applySession(data.session);
        settle(data.session);
      }
      if (data.session) return;
      await startAnonymousSession(client, () => {
        if (active) setStatus("unavailable");
      });
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient, setQueryAuth]);

  return (
    <AnonymousSessionContext.Provider value={{ status, session, retry }}>
      {children}
    </AnonymousSessionContext.Provider>
  );
}

export function useAnonymousSession(): AnonymousSessionContextValue {
  const value = useContext(AnonymousSessionContext);
  if (!value) throw new Error("useAnonymousSession must be used within AnonymousSessionProvider");
  return value;
}
