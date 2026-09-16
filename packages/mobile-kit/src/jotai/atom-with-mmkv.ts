import type { WritableAtom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import type { MMKV } from "react-native-mmkv";

type SyncSetter<T> = T | ((prev: T) => T);

/** The atom `createAtomWithMMKV` builds, for callers that wrap or re-expose one. */
export type MMKVAtom<T> = WritableAtom<T, [SyncSetter<T>], void>;

// MMKV is fully synchronous; we cast the atom's read/write types so callers
// don't have to deal with the `T | Promise<T>` union that atomWithStorage
// returns when it can't statically tell the storage is sync.
//
// `getOnInit: true` lets the atom read its persisted value on the first render.
// Because MMKV reads are synchronous, a hydrated screen never flashes its
// default value for one frame.
export function createAtomWithMMKV(mmkv: MMKV) {
  const storage = {
    getItem: (key: string) => mmkv.getString(key) ?? null,
    setItem: (key: string, value: string) => mmkv.set(key, value),
    removeItem: (key: string) => mmkv.delete(key),
  };
  const jsonStorage = createJSONStorage<unknown>(() => storage);

  return function atomWithMMKV<T>(key: string, initial: T): MMKVAtom<T> {
    return atomWithStorage<T>(key, initial, jsonStorage as never, {
      getOnInit: true,
    }) as MMKVAtom<T>;
  };
}
