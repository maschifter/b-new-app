import { queryAuthAtom } from "@bnewapp/mobile-kit";
import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { AuthSessionProvider } from "../session-provider";

type AuthCallback = (event: string, session: Session | null) => void;

const mockAuth: {
  callback: AuthCallback | null;
  getSession: jest.Mock;
  unsubscribe: jest.Mock;
} = {
  callback: null,
  getSession: jest.fn(),
  unsubscribe: jest.fn(),
};

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthCallback) => {
        mockAuth.callback = cb;
        return { data: { subscription: { unsubscribe: mockAuth.unsubscribe } } };
      },
      getSession: () => mockAuth.getSession(),
    },
  },
}));

type Store = ReturnType<typeof createStore>;

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
  });
}

function sessionFor(userId: string, accessToken: string): Session {
  return { access_token: accessToken, user: { id: userId } } as Session;
}

function mount(store: Store, queryClient: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
  return render(<AuthSessionProvider>{null}</AuthSessionProvider>, { wrapper });
}

function emit(event: string, session: Session | null) {
  act(() => {
    mockAuth.callback?.(event, session);
  });
}

beforeEach(() => {
  mockAuth.callback = null;
  mockAuth.getSession.mockReset();
  mockAuth.unsubscribe.mockReset();
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
});

it("projects the initial getSession result into the query auth atom", async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: sessionFor("user-a", "token-1") } });
  const store = createStore();

  mount(store, createTestQueryClient());

  await waitFor(() => {
    expect(store.get(queryAuthAtom)).toEqual({ userId: "user-a", accessToken: "token-1" });
  });
});

it("updates the token in place on a same-user refresh without dropping cache", async () => {
  const store = createStore();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(["explore-rooms", "user-a"], { pages: [], pageParams: [] });

  mount(store, queryClient);
  emit("INITIAL_SESSION", sessionFor("user-a", "token-1"));
  emit("TOKEN_REFRESHED", sessionFor("user-a", "token-2"));

  expect(store.get(queryAuthAtom)).toEqual({ userId: "user-a", accessToken: "token-2" });
  // Same-user refresh keeps the key/cache: the entry must survive.
  expect(queryClient.getQueryData(["explore-rooms", "user-a"])).toBeDefined();
});

it("clears the atom and removes the user's cache on explicit sign-out", async () => {
  const store = createStore();
  const queryClient = createTestQueryClient();

  mount(store, queryClient);
  emit("INITIAL_SESSION", sessionFor("user-a", "token-1"));
  queryClient.setQueryData(["explore-rooms", "user-a"], { pages: [], pageParams: [] });

  emit("SIGNED_OUT", null);

  expect(store.get(queryAuthAtom)).toBeNull();
  expect(queryClient.getQueryData(["explore-rooms", "user-a"])).toBeUndefined();
});

it("cleans up the same way on a non-interactive session expiry", async () => {
  const store = createStore();
  const queryClient = createTestQueryClient();

  // Signed in via the passive getSession path, no explicit interaction.
  mockAuth.getSession.mockResolvedValue({ data: { session: sessionFor("user-a", "token-1") } });
  mount(store, queryClient);
  await waitFor(() => expect(store.get(queryAuthAtom)).not.toBeNull());
  queryClient.setQueryData(["explore-room", "user-a", "owner-x"], { ownerId: "owner-x" });

  // Background expiry surfaces as a null session with no user action.
  emit("SIGNED_OUT", null);

  expect(store.get(queryAuthAtom)).toBeNull();
  expect(queryClient.getQueryData(["explore-room", "user-a", "owner-x"])).toBeUndefined();
});

it("swaps identity on account replacement, dropping only the previous user's cache", async () => {
  const store = createStore();
  const queryClient = createTestQueryClient();

  mount(store, queryClient);
  emit("INITIAL_SESSION", sessionFor("user-a", "token-a"));
  queryClient.setQueryData(["explore-rooms", "user-a"], { pages: [], pageParams: [] });
  queryClient.setQueryData(["explore-rooms", "user-b"], { pages: [], pageParams: [] });
  queryClient.setQueryData(["explore-room", "user-b", "user-a"], { ownerId: "user-a" });

  emit("SIGNED_IN", sessionFor("user-b", "token-b"));

  expect(store.get(queryAuthAtom)).toEqual({ userId: "user-b", accessToken: "token-b" });
  expect(queryClient.getQueryData(["explore-rooms", "user-a"])).toBeUndefined();
  // The incoming identity's cache is untouched by the outgoing cleanup.
  expect(queryClient.getQueryData(["explore-rooms", "user-b"])).toBeDefined();
  expect(queryClient.getQueryData(["explore-room", "user-b", "user-a"])).toBeDefined();
});
