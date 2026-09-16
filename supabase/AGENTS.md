# Supabase Guidelines

These rules apply to `supabase`. Also follow the root `AGENTS.md`.

## Migration Workflow

- Treat `supabase/migrations/*.sql` as the schema source of truth.
- Declare local Supabase Storage buckets in `supabase/config.toml`. Keep its bucket names, public/private setting, file-size limit, and MIME allowlist aligned with the server upload path; do not infer a missing bucket from the absence of a database migration.
- Create a new timestamped migration for every schema change. Do not edit a migration that may have been applied remotely.
- Make migrations deterministic and safe to re-review. Separate unrelated schema changes.
- Prefer additive rollout: add nullable/defaulted structures, migrate data, update consumers, then tighten constraints in a later safe step.
- Include explicit constraints, indexes, ownership rules, and updated timestamps when the access pattern requires them.

## Security

- Enable and review Row Level Security for user-accessible tables.
- Write policies around `auth.uid()` and the actual ownership model; do not trust client-provided owner ids.
- Keep privileged service-role operations server-only.
- Do not assume every `auth.users` row has a `public.profiles` row. Signup triggers create
  profiles only when an email exists; anonymous users without email have none. Conversion
  from null to non-null email creates the profile through an update trigger. Preserve both
  paths and the username default. A new FK to `profiles`, or a PostgREST embed through one,
  restricts that relation to users with profiles; state that intent on the constraint.
- Review grants, functions, triggers, and `security definer` search paths carefully.

## Types and Consumers

- Regenerate `packages/types/src/database.generated.ts` from the environment where the
  migration was applied. The root `db:types` script uses `--linked`, so it reads the linked
  project, not a local database. For local generation use the Supabase CLI's `--local` mode;
  confirm the target and successful output before replacing the generated file.
- Never hand-edit the generated database types.
- Update shared API types separately when the public wire contract changes; database rows are not automatically API models.
- Trace all affected server queries and mobile/API consumers before making a column non-null, renaming it, or removing it.

## External-State Safety

- Creating or editing a migration is local and reversible.
- `db:push`, linking a Supabase project, running remote SQL, resetting a database, and generating types from a linked project affect or depend on external state. Obtain explicit approval first.
- Before any approved push, show or inspect the exact pending migration and target environment.
