import { createAtomWithMMKV } from "@/lib/jotai/atom-with-mmkv";
import { atom } from "jotai";
import { atomFamily } from "jotai-family";
import { MMKV } from "react-native-mmkv";
import { CATALOG } from "../data/catalog";
import {
  ROOM_TEMPLATE,
  SAMPLE_DECORATION,
  emptyDecoration,
  templateById,
} from "../data/templates";
import { migrate } from "../domain/migrate";
import { reconcile } from "../domain/reconcile";
import type { ContentRef, DecorationSnapshot } from "../domain/types";

// State + persistence for the studio, jotai + MMKV (mirrors request-app's
// atom-with-mmkv convention). MMKV is synchronous, so there is no async load
// pipeline, no `hydrated` gate, and no save-status machine: a write persists
// immediately. The load-time invariants the old repository owned still hold —
// they just run inside the derived read below (coerce -> migrate -> reconcile).

// One MMKV instance per feature, keyed by `id`, exactly like request-app.
const mmkv = new MMKV({ id: "studio" });
const atomWithMMKV = createAtomWithMMKV(mmkv);

// `v1` namespaces the storage-key schema and is independent of the snapshot's
// own `version` (which drives migration). Kept from the AsyncStorage era so the
// key scheme reads the same; note MMKV is a separate store, so pre-existing
// AsyncStorage rooms do not carry over (the feature has not shipped).
const KEY_PREFIX = "studio:v1:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContentRef(value: unknown): value is ContentRef {
  return (
    isRecord(value) &&
    (value.source === "catalog" || value.source === "video") &&
    typeof value.id === "string"
  );
}

// Defensive parse: corrupt or foreign data reads as "no room" rather than
// crashing the derived read (reconcile assumes well-formed ContentRefs). This is
// the structural guard the old repository's parseSnapshot did; malformed JSON is
// already caught upstream by createJSONStorage, which falls back to the initial.
export function coerceSnapshot(value: unknown): DecorationSnapshot {
  if (!isRecord(value)) return emptyDecoration();
  if (typeof value.version !== "number") return emptyDecoration();
  if (!Number.isInteger(value.version) || value.version < 0) return emptyDecoration();
  if (typeof value.templateId !== "string") return emptyDecoration();
  if (!isRecord(value.map) || !Object.values(value.map).every(isContentRef)) {
    return emptyDecoration();
  }
  return {
    version: value.version,
    templateId: value.templateId,
    map: value.map as Record<string, ContentRef>,
  };
}

// Raw persisted snapshot per owner. Keyed by ownerId from the start so visiting
// another user's room is just `snapshotAtom(otherUserId)` with no API change.
// The first-run default is the pre-decorated SAMPLE room (not empty): a brand-new
// owner with nothing persisted opens onto the fully-illustrated reference studio,
// and their first edit overwrites it. `atomWithStorage` only returns this initial
// when the key is absent — it is never written until the user actually edits.
const snapshotAtom = atomFamily((ownerId: string) =>
  atomWithMMKV<DecorationSnapshot>(`${KEY_PREFIX}${ownerId}`, SAMPLE_DECORATION),
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
