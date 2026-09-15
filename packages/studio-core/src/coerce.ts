import { emptyDecoration } from "./template.ts";
import type { ContentRef, DecorationSnapshot } from "./types.ts";

// Defensive parse for a raw persisted/received snapshot. Corrupt or foreign
// data reads as "no room" rather than crashing the migrate -> reconcile
// pipeline (which assumes well-formed ContentRefs). Lives in the shared core so
// the same guard applies wherever a snapshot enters the system — the mobile
// store today, the backend write path later.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isContentRef(value: unknown): value is ContentRef {
  return (
    isRecord(value) &&
    (value.source === "catalog" || value.source === "video") &&
    typeof value.id === "string"
  );
}

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

/**
 * Every catalog item id placed in a raw decoration map, deduped. Unlike
 * `coerceSnapshot`, this is tolerant per entry: a malformed placement is skipped
 * rather than discarding the whole map, because a caller asking "what does this
 * user have placed?" must not lose real placements to one bad neighbour.
 */
export function catalogItemIdsIn(map: unknown): string[] {
  if (!isRecord(map)) return [];
  const ids = new Set<string>();
  for (const value of Object.values(map)) {
    if (isContentRef(value) && value.source === "catalog") ids.add(value.id);
  }
  return [...ids];
}
