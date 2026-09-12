import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import type { ScanStatus } from "@bnewapp/types";
import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react-native";
import { createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { getDanceScoreStatus } from "../../api";
import {
  DanceScoreTimeoutError,
  SCORE_POLL_INTERVAL_MS,
  SCORE_POLL_MAX_ATTEMPTS,
  SCORE_POLL_TIMEOUT_MS,
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

it("surfaces a timeout once the scan outlives the polling deadline", async () => {
  mockedGetDanceScoreStatus.mockResolvedValue(status());
  const { store, unsubscribe } = scanStore(Date.now() - SCORE_POLL_TIMEOUT_MS - 1);

  await waitFor(() =>
    expect(store.get(danceScoreAtom).error).toBeInstanceOf(DanceScoreTimeoutError),
  );
  // A deadline is final: retrying would only re-raise it.
  expect(mockedGetDanceScoreStatus).toHaveBeenCalledTimes(1);
  unsubscribe();
});

it("gives up only after the configured number of consecutive request failures", async () => {
  // Fake timers so the real retry backoff between attempts costs no wall clock.
  jest.useFakeTimers();
  try {
    mockedGetDanceScoreStatus.mockRejectedValue(new Error("network blip"));
    const { store, unsubscribe } = scanStore(Date.now());

    await waitFor(() => expect(mockedGetDanceScoreStatus).toHaveBeenCalledTimes(1));
    expect(store.get(danceScoreAtom).error).toBeNull();

    await jest.advanceTimersByTimeAsync(SCORE_POLL_INTERVAL_MS * SCORE_POLL_MAX_ATTEMPTS);

    expect(mockedGetDanceScoreStatus).toHaveBeenCalledTimes(SCORE_POLL_MAX_ATTEMPTS);
    expect(store.get(danceScoreAtom).error).toBeInstanceOf(Error);
    expect(store.get(danceScoreAtom).error).not.toBeInstanceOf(DanceScoreTimeoutError);
    unsubscribe();
  } finally {
    jest.useRealTimers();
  }
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
