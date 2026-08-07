# Project notes

This repository is an infrastructure scaffold for a dance application. Keep feature work inside its own module and add database migrations only once a concrete flow is defined.

## Database workflow

```bash
pnpm db:new <name> # Create a timestamped migration in supabase/migrations/
pnpm db:push       # Apply pending migrations to the linked Supabase project
pnpm db:types      # Regenerate packages/types/src/database.generated.ts
```

Use migrations as the source of truth for schema changes. After each `db:push`, run
`db:types` and commit the generated types. Review each migration before pushing it.
