# Supabase Guidelines

These rules apply to `supabase`. Also follow the root `AGENTS.md`.

## Migration Workflow

- Treat `supabase/migrations/*.sql` as the schema source of truth.
- Create a new timestamped migration for every schema change. Do not edit a migration that may have been applied remotely.
- Make migrations deterministic and safe to re-review. Separate unrelated schema changes.
- Prefer additive rollout: add nullable/defaulted structures, migrate data, update consumers, then tighten constraints in a later safe step.
- Include explicit constraints, indexes, ownership rules, and updated timestamps when the access pattern requires them.

## Security

- Enable and review Row Level Security for user-accessible tables.
- Write policies around `auth.uid()` and the actual ownership model; do not trust client-provided owner ids.
- Keep privileged service-role operations server-only.
- Review grants, functions, triggers, and `security definer` search paths carefully.

## Types and Consumers

- After an approved remote/local schema application, regenerate `packages/types/src/database.generated.ts` with the root `db:types` script.
- Never hand-edit the generated database types.
- Update shared API types separately when the public wire contract changes; database rows are not automatically API models.
- Trace all affected server queries and mobile/API consumers before making a column non-null, renaming it, or removing it.

## External-State Safety

- Creating or editing a migration is local and reversible.
- `db:push`, linking a Supabase project, running remote SQL, resetting a database, and generating types from a linked project affect or depend on external state. Obtain explicit approval first.
- Before any approved push, show or inspect the exact pending migration and target environment.
