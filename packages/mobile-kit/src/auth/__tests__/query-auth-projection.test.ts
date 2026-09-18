import { QueryClient } from "@tanstack/react-query";
import type { QueryAuth } from "../query-auth-atom";
import { type ProjectableSession, createQueryAuthProjection } from "../query-auth-projection";

function sessionFor(userId: string, accessToken: string): ProjectableSession {
  return { user: { id: userId }, access_token: accessToken };
}

function setup() {
  const projected: (QueryAuth | null)[] = [];
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
  });
  const applySession = createQueryAuthProjection({
    setQueryAuth: (auth) => projected.push(auth),
    queryClient,
  });
  return { applySession, projected, queryClient };
}

it("projects a session into the query auth shape", () => {
  const { applySession, projected } = setup();

  applySession(sessionFor("user-a", "token-1"));

  expect(projected.at(-1)).toEqual({ userId: "user-a", accessToken: "token-1" });
});

it("updates the token in place on a same-user refresh, keeping the cache", () => {
  const { applySession, projected, queryClient } = setup();
  applySession(sessionFor("user-a", "token-1"));
  queryClient.setQueryData(["explore-rooms", "user-a"], { pages: [] });
  projected.length = 0;

  applySession(sessionFor("user-a", "token-2"));

  expect(queryClient.getQueryData(["explore-rooms", "user-a"])).toBeDefined();
  // One write, and never a null: a refresh must not disable the queries in between.
  expect(projected).toEqual([{ userId: "user-a", accessToken: "token-2" }]);
});

it("clears the atom and removes the user's cache when the session ends", () => {
  const { applySession, projected, queryClient } = setup();
  applySession(sessionFor("user-a", "token-1"));
  queryClient.setQueryData(["explore-rooms", "user-a"], { pages: [] });

  applySession(null);

  expect(projected.at(-1)).toBeNull();
  expect(queryClient.getQueryData(["explore-rooms", "user-a"])).toBeUndefined();
});

it("drops only the outgoing identity's cache when the user changes", () => {
  const { applySession, projected, queryClient } = setup();
  applySession(sessionFor("user-a", "token-a"));
  queryClient.setQueryData(["explore-rooms", "user-a"], { pages: [] });
  queryClient.setQueryData(["explore-rooms", "user-b"], { pages: [] });
  queryClient.setQueryData(["explore-room", "user-b", "user-a"], { ownerId: "user-a" });

  applySession(sessionFor("user-b", "token-b"));

  expect(projected.at(-1)).toEqual({ userId: "user-b", accessToken: "token-b" });
  expect(queryClient.getQueryData(["explore-rooms", "user-a"])).toBeUndefined();
  expect(queryClient.getQueryData(["explore-rooms", "user-b"])).toBeDefined();
  // Matching is on queryKey[1], so the outgoing id elsewhere in a key is not a match.
  expect(queryClient.getQueryData(["explore-room", "user-b", "user-a"])).toBeDefined();
});

it("disables queries before enabling the next identity", () => {
  const { applySession, projected } = setup();
  applySession(sessionFor("user-a", "token-a"));
  projected.length = 0;

  applySession(sessionFor("user-b", "token-b"));

  expect(projected).toEqual([null, { userId: "user-b", accessToken: "token-b" }]);
});
