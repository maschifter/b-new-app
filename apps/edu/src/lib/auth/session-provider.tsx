import { createQueryAuthProjection, queryAuthAtom } from "@bnewapp/mobile-kit";
import { subscribeToSupabaseSession } from "@bnewapp/mobile-kit/auth/session-subscription";
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
    // A lost anonymous session is replaced by a *different* anonymous user, so the
    // projection's identity-change path is exercised here, not hypothetical.
    const applySession = createQueryAuthProjection({ setQueryAuth, queryClient });

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

    // Guards the sign-in's own failure callback only; the subscription silences its
    // own callbacks once unsubscribed.
    let active = true;
    const unsubscribe = subscribeToSupabaseSession({
      client,
      onSession: (next) => {
        applySession(next);
        settle(next);
      },
      onInitialReadError: () => setStatus("unavailable"),
      onNoInitialSession: () => {
        void startAnonymousSession(client, () => {
          if (active) setStatus("unavailable");
        });
      },
    });

    return () => {
      active = false;
      unsubscribe();
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
