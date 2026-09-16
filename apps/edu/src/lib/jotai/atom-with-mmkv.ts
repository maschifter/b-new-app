import { type MMKVAtom, createAtomWithMMKV } from "@bnewapp/mobile-kit";
import { MMKV } from "react-native-mmkv";

const mmkv = new MMKV({ id: "edu" });
const atomWithMMKV = createAtomWithMMKV(mmkv);

const KEY_PREFIX = "edu:v1:";

/**
 * The app's local persistence contract. There is no owner key: this app has no
 * user IDs, so persisted state is keyed by the content it belongs to (a `moveId`,
 * a style id) and survives a lost anonymous session by design.
 *
 * Bump `KEY_PREFIX` when a persisted shape changes incompatibly.
 */
export function persistedEduAtom<T>(key: string, initial: T): MMKVAtom<T> {
  return atomWithMMKV<T>(`${KEY_PREFIX}${key}`, initial);
}
