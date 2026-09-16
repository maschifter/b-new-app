import { type DefaultOptions, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderAsync } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import type { ReactElement } from "react";
import { type QueryAuth, queryAuthAtom } from "../auth/query-auth-atom";

export type TestStore = ReturnType<typeof createStore>;

/** Deterministic defaults: nothing is evicted mid-test and a failure surfaces at once. */
const TEST_QUERY_DEFAULTS = { gcTime: Number.POSITIVE_INFINITY, retry: false } as const;

export function createTestQueryClient(overrides: DefaultOptions = {}): QueryClient {
  return new QueryClient({
    defaultOptions: { ...overrides, queries: { ...TEST_QUERY_DEFAULTS, ...overrides.queries } },
  });
}

interface TestStoreOptions {
  queryClient?: QueryClient;
  /** Seeded the way `AuthSessionProvider` would; omit to exercise the signed-out path. */
  auth?: QueryAuth;
}

/**
 * A Jotai store hydrated with the same `QueryClient` the provider tree renders with,
 * so query atoms and React Query hooks share one cache — the contract in CLAUDE.md §6.
 */
export function createTestStore(options: TestStoreOptions = {}): {
  store: TestStore;
  queryClient: QueryClient;
} {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const store = createStore();
  store.set(queryClientAtom, queryClient);
  if (options.auth) store.set(queryAuthAtom, options.auth);
  return { store, queryClient };
}

interface RenderWithProvidersOptions extends TestStoreOptions {
  /** Reuse a store built by `createTestStore`, for a test that seeds atoms before mounting. */
  store?: TestStore;
}

export async function renderWithProviders(
  ui: ReactElement,
  { store, ...storeOptions }: RenderWithProvidersOptions = {},
) {
  const wired = store
    ? { store, queryClient: store.get(queryClientAtom) }
    : createTestStore(storeOptions);
  const rendered = await renderAsync(
    <QueryClientProvider client={wired.queryClient}>
      <Provider store={wired.store}>{ui}</Provider>
    </QueryClientProvider>,
  );
  return { ...rendered, ...wired };
}
