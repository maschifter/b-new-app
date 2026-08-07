# b-new-app

Dance app monorepo with an Expo mobile client, Fastify server, and Supabase.

## Setup

1. Use Node 20 and pnpm 10.13.1.
2. Copy `apps/server/.env.example` to `apps/server/.env`, then copy
   `apps/mobile/.env.example` to `apps/mobile/.env` and fill the values.
3. Link the repository to its Supabase project with `supabase link`, then run
   `pnpm db:push` to apply migrations.
4. In Supabase Auth, enable Email/password. Email confirmation is optional for
   local development; when enabled, a new user must confirm their email before
   signing in.
5. Run `pnpm install`, then `pnpm typecheck`.

`pnpm server:dev` starts the API. `GET /health` does not require a user session.

## Authentication reference flow

The mobile app signs up or signs in directly with Supabase using email/password.
Supabase creates `auth.users`; the migration trigger creates the matching
`public.profiles` row. The app then calls the protected `GET /api/user/me` endpoint
with the Supabase access token, which loads the profile through the Fastify server.

For local native development, leave `EXPO_PUBLIC_API_URL` unset. The app derives the
Metro host automatically, so a physical device follows the development machine's
current LAN address. Set it only to override the API with a shared, tunnelled, or
production backend.

## Database migrations

```bash
pnpm db:new add-dance-moves # create a timestamped SQL migration
# edit the generated file in supabase/migrations/
pnpm db:push                # apply pending migrations to the linked project
pnpm db:types               # regenerate packages/types/src/database.generated.ts
```

Workflow: `db:new` → edit SQL → `db:push` → `db:types`. `db:push` changes the linked
Supabase database; review the migration before running it.
