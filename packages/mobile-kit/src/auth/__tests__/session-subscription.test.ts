import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { subscribeToSupabaseSession } from "../session-subscription";

type AuthListener = (event: string, session: Session | null) => void;

function sessionOf(userId: string): Session {
  return { user: { id: userId }, access_token: `token-${userId}` } as unknown as Session;
}

interface FakeClient {
  client: SupabaseClient;
  emit: AuthListener;
  unsubscribe: jest.Mock;
  resolveRead: (read: { data: { session: Session | null }; error: unknown }) => void;
  rejectRead: (error: Error) => void;
}

function fakeClient(): FakeClient {
  let listener: AuthListener = () => {};
  const unsubscribe = jest.fn();
  let resolveRead!: (read: { data: { session: Session | null }; error: unknown }) => void;
  let rejectRead!: (error: Error) => void;
  const read = new Promise<{ data: { session: Session | null }; error: unknown }>(
    (resolve, reject) => {
      resolveRead = resolve;
      rejectRead = reject;
    },
  );
  const client = {
    auth: {
      onAuthStateChange: (next: AuthListener) => {
        listener = next;
        return { data: { subscription: { unsubscribe } } };
      },
      getSession: () => read,
    },
  } as unknown as SupabaseClient;
  return {
    client,
    emit: (event, session) => listener(event, session),
    unsubscribe,
    resolveRead,
    rejectRead,
  };
}

// The read settles on a microtask, so every assertion after one awaits the queue.
const flush = () => new Promise((resolve) => setImmediate(resolve));

it("delivers the initial read when no auth event preceded it", async () => {
  const onSession = jest.fn();
  const { client, resolveRead } = fakeClient();
  const session = sessionOf("a");

  subscribeToSupabaseSession({ client, onSession });
  resolveRead({ data: { session }, error: null });
  await flush();

  expect(onSession).toHaveBeenCalledTimes(1);
  expect(onSession).toHaveBeenCalledWith(session);
});

/**
 * `onAuthStateChange` is the serialized transition stream; the read is only a fallback
 * for the first value. Letting a late read through would replay a stale session over a
 * newer one.
 */
it("ignores the initial read once a live auth event has been handled", async () => {
  const onSession = jest.fn();
  const { client, emit, resolveRead } = fakeClient();
  const live = sessionOf("live");

  subscribeToSupabaseSession({ client, onSession });
  emit("SIGNED_IN", live);
  resolveRead({ data: { session: sessionOf("stale") }, error: null });
  await flush();

  expect(onSession).toHaveBeenCalledTimes(1);
  expect(onSession).toHaveBeenCalledWith(live);
});

it("reports a failed initial read instead of leaving the caller pending", async () => {
  const onInitialReadError = jest.fn();
  const onSession = jest.fn();
  const { client, resolveRead } = fakeClient();

  subscribeToSupabaseSession({ client, onSession, onInitialReadError });
  resolveRead({ data: { session: null }, error: new Error("offline") });
  await flush();

  expect(onInitialReadError).toHaveBeenCalledTimes(1);
  expect(onSession).not.toHaveBeenCalled();
});

it("reports a rejected initial read the same way", async () => {
  const onInitialReadError = jest.fn();
  const { client, rejectRead } = fakeClient();

  subscribeToSupabaseSession({ client, onSession: jest.fn(), onInitialReadError });
  rejectRead(new Error("offline"));
  await flush();

  expect(onInitialReadError).toHaveBeenCalledTimes(1);
});

it("hands a session-less read to the app that creates its own identity", async () => {
  const onNoInitialSession = jest.fn();
  const { client, resolveRead } = fakeClient();

  subscribeToSupabaseSession({ client, onSession: jest.fn(), onNoInitialSession });
  resolveRead({ data: { session: null }, error: null });
  await flush();

  expect(onNoInitialSession).toHaveBeenCalledTimes(1);
});

it("does not ask for a new identity when the read found one", async () => {
  const onNoInitialSession = jest.fn();
  const { client, resolveRead } = fakeClient();

  subscribeToSupabaseSession({ client, onSession: jest.fn(), onNoInitialSession });
  resolveRead({ data: { session: sessionOf("a") }, error: null });
  await flush();

  expect(onNoInitialSession).not.toHaveBeenCalled();
});

describe("after unsubscribing", () => {
  it("silences a read that was still in flight", async () => {
    const onSession = jest.fn();
    const onNoInitialSession = jest.fn();
    const { client, resolveRead, unsubscribe } = fakeClient();

    const stop = subscribeToSupabaseSession({ client, onSession, onNoInitialSession });
    stop();
    resolveRead({ data: { session: null }, error: null });
    await flush();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(onSession).not.toHaveBeenCalled();
    expect(onNoInitialSession).not.toHaveBeenCalled();
  });

  it("silences a late auth event", () => {
    const onSession = jest.fn();
    const { client, emit } = fakeClient();

    const stop = subscribeToSupabaseSession({ client, onSession });
    stop();
    emit("SIGNED_OUT", null);

    expect(onSession).not.toHaveBeenCalled();
  });
});
