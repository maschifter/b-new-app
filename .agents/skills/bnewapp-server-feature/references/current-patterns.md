# Current Server Patterns

## Composition

- `apps/server/src/index.ts`: process entry point
- `apps/server/src/app.ts`: app factory, plugin registration, route prefixes
- `apps/server/src/config.ts`: Zod-validated environment
- `apps/server/src/plugins/auth.ts`: typed authentication decorator
- `apps/server/src/plugins/supabase.ts`: singleton service client decoration
- `apps/server/src/lib/errors.ts`: normalized and masked errors

Keep `buildApp` injectable and testable. Register infrastructure before routes and keep module registration explicit.

## Route Modules

- `apps/server/src/modules/health/routes.ts`: public route
- `apps/server/src/modules/user/routes.ts`: authenticated lookup and database-to-API mapping
- `apps/server/src/modules/studio/routes.ts`: Zod body validation, server-side reconciliation, select/upsert, shared response types

The studio route is a useful boundary example, not a target size. Extract substantial reusable behavior instead of growing route handlers indefinitely.

## Contracts and Domain Logic

- `packages/types/src/index.ts`: shared API envelopes and models
- `packages/types/src/database.generated.ts`: generated database types; never edit manually
- `packages/studio-core/src/index.ts`: platform-neutral public domain surface
- `packages/studio-core/src/reconcile.ts`: pure invariant enforcement shared by client and server

Database row types and public API models are distinct. Select explicit snake_case columns and map them to a stable camelCase wire model.
