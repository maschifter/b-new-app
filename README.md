# b-new-app

Dance app monorepo: an Expo mobile client, a Fastify API server, and Supabase for
auth and data. Managed with pnpm workspaces and [Turbo](https://turbo.build/).

## Structure

```
apps/
├── mobile/     # Expo (React Native) client        → apps/mobile/README.md
└── server/     # Fastify API                         → apps/server/README.md
packages/
├── types/      # @bnewapp/types  – shared API types + generated Supabase types
└── utils/      # @bnewapp/utils  – shared helpers
supabase/       # Supabase config + SQL migrations
```

Per-app setup, environment variables, and scripts live in each app's README:

- **[apps/mobile/README.md](apps/mobile/README.md)** — Expo client
- **[apps/server/README.md](apps/server/README.md)** — Fastify API

## Prerequisites

- Node 20 (see `.nvmrc`)
- pnpm 10.13.1 (`packageManager` in `package.json`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) for database migrations

## Setup

1. Install dependencies for the whole workspace:
   ```bash
   pnpm install
   ```
2. Create env files and fill in the values:
   ```bash
   cp apps/server/.env.example apps/server/.env
   cp apps/mobile/.env.example apps/mobile/.env
   ```
3. Link and provision Supabase:
   ```bash
   supabase link          # link this repo to your Supabase project
   pnpm db:push           # apply migrations
   ```
   In Supabase Auth, enable Email/password. Email confirmation is optional for local
   development; when enabled, a new user must confirm their email before signing in.
4. Verify the workspace:
   ```bash
   pnpm typecheck
   ```

## Development

```bash
pnpm server:dev     # start the API (GET /health needs no session)
pnpm mobile         # start Metro for the mobile app
pnpm mobile:ios     # build & run the iOS app
pnpm mobile:android # build & run the Android app
```

The mobile app signs in directly with Supabase, then calls the protected
`GET /api/user/me` on the server with the Supabase access token. See each app's README
for the full flow and API-URL resolution details.

## Workspace scripts

Run from the repository root; Turbo fans them out across the workspace.

| Script            | Description                                    |
| ----------------- | ---------------------------------------------- |
| `pnpm build`      | Build all packages (`turbo build`)             |
| `pnpm dev`        | Run all `dev` tasks                            |
| `pnpm typecheck`  | Type-check every workspace                     |
| `pnpm test`       | Run tests across the workspace                 |
| `pnpm lint`       | Lint with Biome                                |
| `pnpm format`     | Format & autofix with Biome                    |

App-specific shortcuts are prefixed (`pnpm server:*`, `pnpm mobile:*`) and proxy to the
matching script inside that app.

## Database migrations

```bash
pnpm db:new add-dance-moves # create a timestamped SQL migration
# edit the generated file in supabase/migrations/
pnpm db:push                # apply pending migrations to the linked project
pnpm db:types               # regenerate packages/types/src/database.generated.ts
```

Workflow: `db:new` → edit SQL → `db:push` → `db:types`. Migrations are the source of
truth for the schema. `db:push` changes the linked Supabase database — review the
migration before running it, and commit the regenerated types afterwards.
