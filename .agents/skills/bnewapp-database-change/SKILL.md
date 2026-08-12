---
name: bnewapp-database-change
description: Design and implement safe BNewApp Supabase/PostgreSQL schema changes with forward-only migrations, Row Level Security, ownership policies, indexes, triggers, generated database types, and consumer tracing. Use for work in supabase/migrations, tables, columns, constraints, policies, functions, triggers, schema types, data backfills, or database-backed API changes.
---

# BNewApp Database Change

Evolve the Supabase schema safely while preserving authorization, compatibility, generated types, and downstream contracts.

## Load Context

1. Resolve the repository root with `git rev-parse --show-toplevel`, then read `<repo-root>/AGENTS.md` and `<repo-root>/supabase/AGENTS.md` completely.
2. Read [references/current-schema.md](references/current-schema.md).
3. Inspect all existing migrations for the affected objects, `packages/types/src/database.generated.ts`, server queries, shared API models, and mobile consumers.
4. If the change includes an endpoint, use `$bnewapp-server-feature` after designing the schema.

## Plan the Rollout

1. State the current schema and access path.
2. Identify data compatibility, backfill, lock, uniqueness, nullability, index, and rollback risks.
3. Prefer an additive rollout when old and new code may overlap:
   - add a compatible structure;
   - backfill safely;
   - update readers and writers;
   - tighten or remove in a later migration.
4. Define ownership and RLS behavior for select, insert, update, and delete. Omit an operation intentionally, not accidentally.
5. Keep database rows separate from the public API contract.

## Create the Migration

Create a timestamped migration with the repository script when appropriate:

```sh
corepack pnpm db:new <descriptive-name>
```

Then edit the generated SQL. Make object names explicit and consistent with existing `snake_case` conventions.

- Add foreign-key delete behavior intentionally.
- Add constraints that encode real invariants.
- Add indexes for actual filters, joins, uniqueness, or ordering requirements.
- Use UTC-aware timestamps.
- For `security definer` functions, set a safe `search_path` and schema-qualify objects.
- Keep data migrations bounded and reviewable; avoid an unbounded rewrite in the same transaction without assessing impact.

Do not edit an existing applied migration to change history.

## Update Types and Consumers

1. Update server queries and mappings after the migration contract is clear.
2. Update `@bnewapp/types` only when the public API model changes.
3. Regenerate `packages/types/src/database.generated.ts` only from the intended Supabase target; never patch it manually.
4. Add tests for domain and API behavior affected by the schema.

## Approval Gate and Validation

Local migration authoring and static review do not require remote access. Obtain explicit approval before linking a project, applying migrations, running remote SQL, resetting a database, or generating types from a linked target.

After approval, inspect the target and pending migration before running:

```sh
corepack pnpm db:push
corepack pnpm db:types
```

Then run affected package/server checks and inspect the generated diff. Report the target environment, applied migration, generated type changes, and checks performed.
