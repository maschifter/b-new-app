import { queryAuthAtom } from "@bnewapp/mobile-kit";
import type { ScanStatus } from "@bnewapp/types";
import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react-native";
import { createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { getDanceScoreStatus } from "../../api";
import {
  SCORE_POLL_INITIAL_INTERVAL_MS,
  SCORE_POLL_MAX_INTERVAL_MS,
  scorePollIntervalMs,
} from "../../score-polling";
import { danceScoreAtom } from "../queries";
import { activeDanceScanAtom } from "../ui";

jest.mock("../../api", () => ({
  getDanceGenres: jest.fn(),
  getDanceMove: jest.fn(),
  getDanceMoves: jest.fn(),
  getDanceScoreStatus: jest.fn(),
}));

const mockedGetDanceScoreStatus = jest.mocked(getDanceScoreStatus);

const POST_ID = "00000000-0000-4000-8000-000000000010";

function status(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return {
    status: "scoring",
    hasScore: false,
    score: null,
    isExternalScore: false,
    jobState: "processing",
    ...overrides,
  };
}

// Not `createTestStore`: the atom under test owns retry/refetch, so this client must
// leave `retry` at its default rather than the shared helper's `retry: false`.
function scanStore(startedAt: number) {
  const store = createStore();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retryDelay: 0 } },
  });
  store.set(queryClientAtom, queryClient);
  store.set(queryAuthAtom, { userId: "dancer", accessToken: "token" });
  store.set(activeDanceScanAtom, { postId: POST_ID, startedAt });
  // Reading the atom is not enough to start the query: jotai-tanstack-query only
  // subscribes once the atom is mounted, which `store.sub` does.
  const unsubscribe = store.sub(danceScoreAtom, () => {});
  return { store, unsubscribe };
}

beforeEach(() => {
  mockedGetDanceScoreStatus.mockReset();
});

it("stays disabled until a scan has been queued", () => {
  const store = createStore();
  store.set(queryClientAtom, new QueryClient());
  store.set(queryAuthAtom, { userId: "dancer", accessToken: "token" });

  const unsubscribe = store.sub(danceScoreAtom, () => {});
  expect(store.get(danceScoreAtom).fetchStatus).toBe("idle");
  expect(mockedGetDanceScoreStatus).not.toHaveBeenCalled();
  unsubscribe();
});

it("keeps the in-flight status while the scan has not reached a terminal state", async () => {
  mockedGetDanceScoreStatus.mockResolvedValue(status());
  const { store, unsubscribe } = scanStore(Date.now());

  await waitFor(() => expect(store.get(danceScoreAtom).data).toEqual(status()));
  expect(store.get(danceScoreAtom).error).toBeNull();
  unsubscribe();
});

it("keeps polling an old in-flight scan instead of imposing a client deadline", async () => {
  mockedGetDanceScoreStatus.mockResolvedValue(status());
  const { store, unsubscribe } = scanStore(Date.now() - 10 * 60_000);

  await waitFor(() => expect(store.get(danceScoreAtom).data).toEqual(status()));
  expect(store.get(danceScoreAtom).error).toBeNull();
  expect(mockedGetDanceScoreStatus).toHaveBeenCalledTimes(1);
  unsubscribe();
});

it("backs off polling from two seconds to five seconds", () => {
  expect(scorePollIntervalMs(1)).toBe(SCORE_POLL_INITIAL_INTERVAL_MS);
  expect(scorePollIntervalMs(2)).toBe(3_000);
  expect(scorePollIntervalMs(10)).toBe(SCORE_POLL_MAX_INTERVAL_MS);
});

it("stops polling as soon as the scan reports a score", async () => {
  mockedGetDanceScoreStatus.mockResolvedValue(
    status({ status: "scored", hasScore: true, score: 96, jobState: "completed" }),
  );
  const { store, unsubscribe } = scanStore(Date.now());

  await waitFor(() => expect(store.get(danceScoreAtom).data?.score).toBe(96));
  const query = store.get(danceScoreAtom);
  expect(query.isRefetching).toBe(false);
  unsubscribe();
});
