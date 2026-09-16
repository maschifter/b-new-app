import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import { useAtomValue } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { QueryProvider } from "../query-provider";

// The whole point of the hydrator: React Query hooks and jotai query atoms must
// resolve the exact same QueryClient so they share one cache.
it("hydrates queryClientAtom with the same client React Query hooks use", () => {
  let hookClient: QueryClient | undefined;
  let atomClient: QueryClient | undefined;

  function Probe() {
    hookClient = useQueryClient();
    atomClient = useAtomValue(queryClientAtom);
    return null;
  }

  render(
    <QueryProvider>
      <Probe />
    </QueryProvider>,
  );

  expect(hookClient).toBeInstanceOf(QueryClient);
  expect(atomClient).toBe(hookClient);
});
