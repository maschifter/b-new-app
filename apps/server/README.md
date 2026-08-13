# @bnewapp/server

Fastify API for the dance app. It validates Supabase-issued JWTs, exposes a public
health check, and serves protected endpoints backed by Supabase.

## Stack

- [Fastify 5](https://fastify.dev/) with `@fastify/cors`, `@fastify/jwt`,
  `@fastify/rate-limit`, and `@fastify/sensible`
- [Supabase](https://supabase.com/) service client (`@supabase/supabase-js`)
- [Zod](https://zod.dev/) for environment validation
- [Vitest](https://vitest.dev/) for tests
- TypeScript ESM, run with `tsx` in development and compiled with `tsc` for production

## Getting started

From the repository root (dependencies are installed once for the whole workspace):

```bash
pnpm install
```

Then configure the server:

```bash
cp apps/server/.env.example apps/server/.env
# fill in SUPABASE_URL and SUPABASE_SECRET_KEY
```

Run the API in watch mode:

```bash
pnpm server:dev        # from the repo root
# or, from apps/server:
pnpm dev
```

`GET /health` should respond without a session:

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```

## Environment variables

Validated by `src/config.ts`; the process exits on startup if any value is invalid.

| Variable              | Required | Default         | Notes                                                              |
| --------------------- | -------- | --------------- | ------------------------------------------------------------------ |
| `NODE_ENV`            | no       | `development`   | `development` \| `test` \| `staging` \| `production`               |
| `PORT`                | no       | `3000`          | Listening port                                                     |
| `HOST`                | no       | `0.0.0.0`       | Bind address (`0.0.0.0` lets physical devices reach it over LAN)   |
| `LOG_LEVEL`           | no       | `info`          | Pino level; pretty-printed in development                          |
| `ALLOWED_ORIGINS`     | no       | —               | Comma-separated CORS allowlist for non-development environments    |
| `RATE_LIMIT_MAX`      | no       | `120`           | Requests per minute per client                                     |
| `SUPABASE_URL`        | **yes**  | —               | Supabase project URL                                               |
| `SUPABASE_SECRET_KEY` | **yes**  | —               | Supabase secret key — server-side only, never ship it to a client |

CORS is fully open in `development`. In every other environment it uses
`ALLOWED_ORIGINS`, and rejects all origins when the list is empty.

## Authentication

The mobile client authenticates directly with Supabase and sends the resulting
access token as `Authorization: Bearer <token>`. The server does not hold session
state; instead `@fastify/jwt` verifies each token against Supabase's JWKS
(`<SUPABASE_URL>/auth/v1`, fetched via `get-jwks`).

`app.authenticate` (see `src/plugins/auth.ts`) is a `preHandler` guard that rejects
missing or invalid tokens with `401`. The verified payload is available as
`request.user` (`sub`, `email`).

## Endpoints

| Method | Path                       | Auth | Description                                             |
| ------ | -------------------------- | ---- | ------------------------------------------------------- |
| `GET`  | `/health`                  | no   | Liveness check: `{ status, timestamp }`                 |
| `GET`  | `/api/user/me`             | yes  | Current user's profile from `public.profiles`           |
| `GET`  | `/api/studio/room`         | yes  | Current user's saved studio room, or `null`             |
| `PUT`  | `/api/studio/room`         | yes  | Reconcile and upsert the current user's studio snapshot |
| `GET`  | `/api/studio/rooms`        | yes  | Cursor-paginated Explore feed of other users' rooms     |
| `GET`  | `/api/studio/rooms/:ownerId` | yes | A user's room for read-only Explore detail              |

Successful responses are wrapped as `{ data: ... }` (`ApiSuccess<T>` from
`@bnewapp/types`). Errors flow through the handler in `src/lib/errors.ts` and return
`{ code, message }`; 5xx messages are masked to avoid leaking internals.

## Project structure

```
src/
├── index.ts              # entrypoint: load config, build app, listen
├── app.ts                # buildApp(): register plugins and routes
├── config.ts             # Zod-validated environment (Env type)
├── lib/
│   └── errors.ts         # global error handler → { code, message }
├── modules/
│   ├── health/routes.ts  # GET /health
│   ├── studio/routes.ts  # Studio room persistence and Explore reads
│   └── user/routes.ts    # GET /api/user/me
└── plugins/
    ├── auth.ts           # authenticate decorator (JWT verify)
    └── supabase.ts       # supabase client decorator
```

Routes are grouped into feature modules under `src/modules/` and registered in
`app.ts`. Add a new feature by creating `src/modules/<name>/routes.ts` and
registering it there, ideally under its own `/api/<name>` prefix.

## Scripts

```bash
pnpm dev        # tsx watch with .env loaded
pnpm build      # tsc → dist/
pnpm start      # node dist/index.js (expects a prior build)
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run
```
