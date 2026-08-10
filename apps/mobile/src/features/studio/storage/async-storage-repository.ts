import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DecorationSnapshot } from "../domain/types";
import type { DecorationRepository } from "./repository";

// On-device implementation. The `v1` here namespaces the *storage key* schema
// and is independent of the snapshot's own `version` (which drives migration).
const KEY_PREFIX = "studio:v1:";

function storageKey(ownerId: string): string {
  return `${KEY_PREFIX}${ownerId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContentRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.source === "catalog" || value.source === "video") &&
    typeof value.id === "string"
  );
}

// Parse defensively: corrupt or foreign data reads as "no room" rather than
// crashing the load pipeline. Structural validity beyond this (stale template /
// removed items) is the reconcile step's job, not the gateway's.
function parseSnapshot(raw: string): DecorationSnapshot | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  const record = value;
  if (typeof record.version !== "number") return null;
  if (typeof record.templateId !== "string") return null;
  if (!isRecord(record.map) || !Object.values(record.map).every(isContentRef)) return null;

  return {
    version: record.version,
    templateId: record.templateId,
    map: record.map as DecorationSnapshot["map"],
  };
}

export const asyncStorageRepository: DecorationRepository = {
  async load(ownerId) {
    const raw = await AsyncStorage.getItem(storageKey(ownerId));
    return raw === null ? null : parseSnapshot(raw);
  },
  async save(ownerId, snapshot) {
    await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(snapshot));
  },
};
