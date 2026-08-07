# b-new-app

Dance app monorepo with an Expo mobile client and Fastify server scaffold.

## Setup

1. Use Node 20 and pnpm 10.13.1.
2. Copy `apps/server/.env.example` to `apps/server/.env`, then copy
   `apps/mobile/.env.example` to `apps/mobile/.env` and fill the values.
3. Run `pnpm install`, then `pnpm typecheck`.

`pnpm server:dev` starts the API. `GET /health` does not require a user session.
