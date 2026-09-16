import { persistedEduAtom } from "@/lib/jotai/atom-with-mmkv";
import { createStore } from "jotai";
import { MMKV } from "react-native-mmkv";

// Reaches the same store the helper writes to; the mock keys its in-memory maps
// by MMKV id, so this asserts the store id as well as the key namespace.
const eduStore = new MMKV({ id: "edu" });

it("persists under the versioned edu namespace, keyed by content id alone", () => {
  const store = createStore();
  const atom = persistedEduAtom<number>("move:11111111-1111-4111-8111-111111111111", 0);

  store.set(atom, 87);

  expect(eduStore.getString("edu:v1:move:11111111-1111-4111-8111-111111111111")).toBe("87");
  // No owner segment: this app has no user IDs, so a lost anonymous session must
  // not orphan local profile data.
  expect(eduStore.getAllKeys()).toEqual(["edu:v1:move:11111111-1111-4111-8111-111111111111"]);
});

it("hydrates a previously stored value on first read", () => {
  eduStore.set("edu:v1:styles", JSON.stringify(["hiphop"]));

  const store = createStore();
  expect(store.get(persistedEduAtom<string[]>("styles", []))).toEqual(["hiphop"]);
});
