import type { LearnedMoveSnapshot } from "@/lib/collection";
import {
  averageScoreAtom,
  deletePersonalRecordingAtom,
  learnedCountAtom,
  learnedCountByGenreAtomFamily,
  learnedMovesAtom,
  personalRecordingsAtom,
  recordFirstScanAtom,
  saveConfirmedScoreAtom,
  savePersonalRecordingAtom,
} from "@/lib/collection";
import { createStore } from "jotai";
import { MMKV } from "react-native-mmkv";

// The same store the atoms write to; the mock keys its in-memory maps by MMKV id.
const eduStore = new MMKV({ id: "edu" });
const LEARNED_MOVES_KEY = "edu:v1:learned-moves";

type CollectionModule = typeof import("@/lib/collection");

// `atomWithStorage` reads the persisted value when the atom is created, which in
// the app is once per launch, so hydration is only observable on a fresh module
// registry. The mock's stores are module-scoped, hence the seeding inside the
// isolated scope rather than through `eduStore`.
function launchWith(storedJson: string): CollectionModule {
  let loaded: CollectionModule | undefined;
  jest.isolateModules(() => {
    const { MMKV: IsolatedMMKV } = require("react-native-mmkv") as { MMKV: typeof MMKV };
    new IsolatedMMKV({ id: "edu" }).set(LEARNED_MOVES_KEY, storedJson);
    loaded = require("@/lib/collection") as CollectionModule;
  });
  if (loaded === undefined) throw new Error("the collection module did not load");
  return loaded;
}

const SNAPSHOT: LearnedMoveSnapshot = {
  title: "Two Step",
  thumbnailUrl: null,
  genreIds: ["hiphop", "afro"],
  level: 2,
  videoUrl: "https://cdn.example.test/two-step.mp4",
};

function learn(store: ReturnType<typeof createStore>, moveId: string, score: number) {
  store.set(recordFirstScanAtom, { moveId, score, isExternalScore: true, snapshot: SNAPSHOT });
}

it("round-trips a learned move through MMKV into the next launch", () => {
  const writer = createStore();
  writer.set(recordFirstScanAtom, {
    moveId: "a",
    score: 64,
    isExternalScore: false,
    snapshot: SNAPSHOT,
  });

  expect(eduStore.getAllKeys()).toEqual([LEARNED_MOVES_KEY]);

  const written = eduStore.getString(LEARNED_MOVES_KEY);
  if (written === undefined) throw new Error("the learned moves were not persisted");
  const moves = createStore().get(launchWith(written).learnedMovesAtom);

  expect(moves.a?.savedScore).toBe(64);
  expect(moves.a?.isExternalScore).toBe(false);
  expect(moves.a?.move).toEqual(SNAPSHOT);
});

it("updates the derived reads after a first scan and after a confirmed save", () => {
  const store = createStore();
  expect(store.get(averageScoreAtom)).toBeNull();

  learn(store, "a", 20);
  learn(store, "b", 100);

  expect(store.get(averageScoreAtom)).toBe(60);
  expect(store.get(learnedCountAtom)).toBe(2);
  expect(store.get(learnedCountByGenreAtomFamily("hiphop"))).toBe(2);
  expect(store.get(learnedCountByGenreAtomFamily("ballet"))).toBe(0);

  store.set(saveConfirmedScoreAtom, { moveId: "b", score: 40, isExternalScore: true });

  expect(store.get(averageScoreAtom)).toBe(30);
  expect(store.get(learnedCountAtom)).toBe(2);
});

it("reads the coerced subset of corrupt stored JSON without throwing", () => {
  const collection = launchWith(
    JSON.stringify({
      a: { moveId: "a", savedScore: 70, learnedAt: "2026-09-17T10:00:00.000Z", move: SNAPSHOT },
      b: "not a record",
    }),
  );
  const store = createStore();

  expect(Object.keys(store.get(collection.learnedMovesAtom))).toEqual(["a"]);
  expect(store.get(collection.averageScoreAtom)).toBe(70);
});

it("keeps the learned move when its personal recording is deleted", () => {
  const store = createStore();
  learn(store, "a", 70);
  store.set(savePersonalRecordingAtom, {
    moveId: "a",
    fileName: "a.mp4",
    durationS: 8,
  });

  expect(store.get(personalRecordingsAtom).a?.fileName).toBe("a.mp4");

  store.set(deletePersonalRecordingAtom, "a");

  expect(store.get(personalRecordingsAtom)).toEqual({});
  expect(store.get(learnedMovesAtom).a?.savedScore).toBe(70);
});

it("reports a rejected delete and puts the record back", () => {
  const store = createStore();
  learn(store, "a", 70);
  store.set(savePersonalRecordingAtom, { moveId: "a", fileName: "a.mp4", durationS: 8 });
  const write = MMKV.prototype.set;
  const rejected = jest.spyOn(MMKV.prototype, "set").mockImplementation((key, value) => {
    if (key.endsWith("personal-recordings")) throw new Error("the device rejected the write");
    write.call(eduStore, key, value);
  });

  expect(store.set(deletePersonalRecordingAtom, "a")).toBe(false);
  // What the screen reads now matches the disk the write never reached, so its retry
  // still has both the record and the file it is about.
  expect(store.get(personalRecordingsAtom).a?.fileName).toBe("a.mp4");

  rejected.mockRestore();

  expect(store.set(deletePersonalRecordingAtom, "a")).toBe(true);
  expect(store.get(personalRecordingsAtom)).toEqual({});
});
