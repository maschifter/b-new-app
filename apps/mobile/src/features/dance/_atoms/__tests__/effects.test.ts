import { createStore } from "jotai";
import { startDanceScorePollingAtom } from "../effects";
import { activeDanceScanAtom } from "../ui";

const POST_ID = "00000000-0000-4000-8000-000000000010";

it("starts polling once for the post that was successfully uploaded", () => {
  const store = createStore();
  const now = Date.now();

  store.set(startDanceScorePollingAtom, POST_ID);

  expect(store.get(activeDanceScanAtom)).toEqual({
    postId: POST_ID,
    startedAt: expect.any(Number),
  });
  expect(store.get(activeDanceScanAtom)?.startedAt).toBeGreaterThanOrEqual(now);
});

it("does not reset the slow-score clock while the same post is still active", () => {
  const store = createStore();
  const activeScan = { postId: POST_ID, startedAt: Date.now() - 90_000 };
  store.set(activeDanceScanAtom, activeScan);

  store.set(startDanceScorePollingAtom, POST_ID);

  expect(store.get(activeDanceScanAtom)).toEqual(activeScan);
});
