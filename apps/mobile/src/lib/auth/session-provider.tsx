import { createQueryAuthProjection, queryAuthAtom } from "@bnewapp/mobile-kit";
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
    const applySession = createQueryAuthProjection({ setQueryAuth, queryClient });

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
