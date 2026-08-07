# b-new-app

Dance app monorepo with an Expo mobile client and Fastify server scaffold.

## Setup

1. Use Node 20 and pnpm 10.13.1.
2. Copy `.env.example` to `.env` and fill the Supabase values when enabling authenticated endpoints.
3. Run `pnpm install`, then `pnpm typecheck`.

`pnpm server:dev` starts the API. `GET /health` does not require credentials.
