import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryClientAtom } from "jotai-tanstack-query";
import { useHydrateAtoms } from "jotai/utils";
import { type PropsWithChildren, useState } from "react";

// Hydrate jotai-tanstack-query's queryClientAtom with the exact same client the
// React Query hooks use, so both APIs share one cache instead of each creating
// its own. Runs on the store from context (the default store, since the app
// mounts no jotai Provider) — the same store the query atoms read from.
function HydrateQueryClient({ client, children }: PropsWithChildren<{ client: QueryClient }>) {
  useHydrateAtoms([[queryClientAtom, client]]);
  return <>{children}</>;
}

export function QueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <HydrateQueryClient client={client}>{children}</HydrateQueryClient>
    </QueryClientProvider>
  );
}
