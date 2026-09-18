import { createQueryAuthProjection, queryAuthAtom } from "@bnewapp/mobile-kit";
import { subscribeToSupabaseSession } from "@bnewapp/mobile-kit/auth/session-subscription";
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

    const applySession = createQueryAuthProjection({ setQueryAuth, queryClient });

    return subscribeToSupabaseSession({
      client: supabase,
      onSession: (next) => {
        applySession(next);
        setSession(next);
        setHydrated(true);
      },
      // A read that never answered is not a session, and the gate below treats it the
      // same as none: the sign-in screen, which offers a way forward, rather than a
      // spinner with nothing left to wait for.
      onInitialReadError: () => setHydrated(true),
    });
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
