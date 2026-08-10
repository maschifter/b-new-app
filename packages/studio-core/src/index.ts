// Public API of the shared studio domain. Pure TypeScript — no React, RN, expo,
// or storage — so both the mobile client and the backend consume the same
// contract, matching rules, migration chain, and seed data.

export * from "./types.ts";
export { fits } from "./fits.ts";
export { CURRENT_VERSION, migrate } from "./migrate.ts";
export { reconcile } from "./reconcile.ts";
export { CATALOG, catalogItemById } from "./catalog.ts";
export {
  DESIGN_CANVAS,
  DEFAULT_TEMPLATE_ID,
  ROOM_TEMPLATE,
  templateById,
  emptyDecoration,
  SAMPLE_DECORATION,
} from "./template.ts";
export { coerceSnapshot } from "./coerce.ts";
