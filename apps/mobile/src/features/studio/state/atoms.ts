import { createAtomWithMMKV } from "@/lib/jotai/atom-with-mmkv";
import {
  CATALOG,
  type DecorationSnapshot,
  ROOM_TEMPLATE,
  coerceSnapshot,
  emptyDecoration,
  migrate,
  reconcile,
  templateById,
} from "@bnewapp/studio-core";
import { atom } from "jotai";
import { atomFamily } from "jotai-family";
import { MMKV } from "react-native-mmkv";

// Studio state and persistence use Jotai with synchronous MMKV storage. There
// is no async load pipeline, `hydrated` gate, or save-status machine: writes
// persist immediately. Load-time invariants run inside the derived read below
// (coerce -> migrate -> reconcile).

// Use one MMKV instance for the feature, keyed by `id`.
const mmkv = new MMKV({ id: "studio" });
const atomWithMMKV = createAtomWithMMKV(mmkv);

// `v1` namespaces the storage-key schema and is independent of the snapshot's
// own `version` (which drives migration). Kept from the AsyncStorage era so the
// key scheme reads the same; note MMKV is a separate store, so pre-existing
// AsyncStorage rooms do not carry over (the feature has not shipped).
const KEY_PREFIX = "studio:v1:";

// `coerceSnapshot` (defensive parse of corrupt/foreign data) now lives in the
// shared domain package alongside migrate/reconcile — see @bnewapp/studio-core.

// Raw persisted snapshot per owner. Keyed by ownerId from the start so visiting
// another user's room is just `snapshotAtom(otherUserId)` with no API change.
// The first-run default is an empty room: a brand-new owner starts from scratch
// and decorates it themselves (the server is the source of truth for any room
// that already exists). `atomWithStorage` only returns this initial when the key
// is absent — it is never written until the user actually edits.
const snapshotAtom = atomFamily((ownerId: string) =>
  atomWithMMKV<DecorationSnapshot>(`${KEY_PREFIX}${ownerId}`, emptyDecoration()),
);

// True once this device has actually persisted a room for `ownerId` (i.e. the
// user edited, or a server room was applied). MMKV only writes the key on the
// first real write, so an absent key means the atom is still on its untouched
// empty default — which the sync layer must not treat as local edits.
export function hasStoredRoom(ownerId: string): boolean {
  return mmkv.contains(`${KEY_PREFIX}${ownerId}`);
}

// JSON of the snapshot last confirmed in sync with the server, or null when the
// room has never synced on this device. The sync layer diffs the live snapshot
// against this marker to decide what is dirty (see studio-sync). Persisted so an
// offline edit made before a restart is still recognised as unpushed.
export const syncedSnapshotAtom = atomFamily((ownerId: string) =>
  atomWithMMKV<string | null>(`${KEY_PREFIX}synced:${ownerId}`, null),
);

// The rendered decoration: the raw snapshot validated against the *current*
// template + catalog every time the raw value changes (design §6, rule 8).
// Writes persist a full snapshot straight through to MMKV.
export const decorationAtom = atomFamily((ownerId: string) => {
  const base = snapshotAtom(ownerId);
  return atom(
    (get) => {
      const raw = coerceSnapshot(get(base));
      const migrated = migrate(raw);
      const template = templateById(migrated.templateId) ?? ROOM_TEMPLATE;
      return reconcile(migrated, template, CATALOG);
    },
    (_get, set, next: DecorationSnapshot) => {
      set(base, next);
    },
  );
});

// Ephemeral UI selection — which spot's picker is open. It remains isolated by
// room owner so a session switch cannot leave one owner's picker open while
// editing another owner's snapshot. This state is intentionally not persisted.
export const selectedSpotAtom = atomFamily((_ownerId: string) => atom<string | null>(null));
