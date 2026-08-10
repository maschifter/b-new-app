import type { WritableAtom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import type { MMKV } from "react-native-mmkv";

type SyncSetter<T> = T | ((prev: T) => T);

// MMKV is fully synchronous; we cast the atom's read/write types so callers
// don't have to deal with the `T | Promise<T>` union that atomWithStorage
// returns when it can't statically tell the storage is sync.
//
// Ported from request-app (src/lib/jotai/atom-with-mmkv.ts). One deliberate
// addition: `getOnInit: true`. Because MMKV reads are synchronous, this lets the
// atom read its persisted value on the very first render instead of one frame
// later — so a hydrated screen never flashes its default first.
export function createAtomWithMMKV(mmkv: MMKV) {
  const storage = {
    getItem: (key: string) => mmkv.getString(key) ?? null,
    setItem: (key: string, value: string) => mmkv.set(key, value),
    removeItem: (key: string) => mmkv.delete(key),
  };
  const jsonStorage = createJSONStorage<unknown>(() => storage);

  return function atomWithMMKV<T>(key: string, initial: T): WritableAtom<T, [SyncSetter<T>], void> {
    return atomWithStorage<T>(key, initial, jsonStorage as never, {
      getOnInit: true,
    }) as WritableAtom<T, [SyncSetter<T>], void>;
  };
}
