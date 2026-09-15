import { coerceSnapshot } from "./coerce.ts";
import { migrate } from "./migrate.ts";
import { reconcile } from "./reconcile.ts";
import { ROOM_TEMPLATE, templateById } from "./template.ts";
import type { CatalogItem, DecorationSnapshot, RoomTemplate } from "./types.ts";

/**
 * The template a *read* renders against. An unknown id falls back to the default
 * rather than failing, so a room saved under a retired template still shows. A
 * write must not use this: silently retargeting a template would rewrite the room.
 */
export function templateOrDefault(templateId: string): RoomTemplate {
  return templateById(templateId) ?? ROOM_TEMPLATE;
}

/**
 * Turn stored or transported room data into a renderable snapshot: coerce the
 * untrusted shape, migrate it to the current version, then reconcile it against
 * the read template and the given catalog. Read path only — see `templateOrDefault`.
 */
export function hydrateSnapshot(raw: unknown, catalog: CatalogItem[]): DecorationSnapshot {
  const migrated = migrate(coerceSnapshot(raw));
  return reconcile(migrated, templateOrDefault(migrated.templateId), catalog);
}
