import type { Session, SupabaseClient } from "@supabase/supabase-js";

interface SupabaseSessionSubscriptionOptions {
  client: SupabaseClient;
  /**
   * Every session transition, and the initial read when no auth event preceded it.
   * `null` means signed out. Called only while the subscription is live.
   */
  onSession: (session: Session | null) => void;
  /**
   * The initial read failed. No session was delivered and none will be until an auth
   * event arrives, so a provider that gates its tree must leave its pending state here.
   */
  onInitialReadError?: (() => void) | undefined;
  /**
   * The initial read succeeded and found no session — where an app that creates one
   * of its own starts the sign-in. Supabase warns against calling an auth method from
   * inside `onAuthStateChange`, which is why this fires from the read instead.
   */
  onNoInitialSession?: (() => void) | undefined;
}

/**
 * The Supabase session stream both apps read, shared because the ordering rules are
 * subtle enough that two copies would drift.
 *
 * `onAuthStateChange` delivers events in order (INITIAL_SESSION, then refresh /
 * sign-in / sign-out), so it is the serialized transition stream. `getSession` is only
 * a fallback for the initial read and is ignored once a live event has been handled.
 *
 * Returns the unsubscribe. After it runs no callback fires, including one the pending
 * initial read would otherwise have reached.
 */
export function subscribeToSupabaseSession({
  client,
  onSession,
  onInitialReadError,
  onNoInitialSession,
}: SupabaseSessionSubscriptionOptions): () => void {
  let active = true;
  let receivedAuthEvent = false;

  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    receivedAuthEvent = true;
    if (active) onSession(session);
  });

  void (async () => {
    let read: Awaited<ReturnType<SupabaseClient["auth"]["getSession"]>>;
    try {
      read = await client.auth.getSession();
    } catch {
      if (active) onInitialReadError?.();
      return;
    }
    if (!active) return;
    if (read.error) {
      onInitialReadError?.();
      return;
    }
    if (!receivedAuthEvent) onSession(read.data.session);
    if (read.data.session === null) onNoInitialSession?.();
  })();

  return () => {
    active = false;
    subscription.unsubscribe();
  };
}
