# Server Guidelines

These rules apply to `apps/server`. Also follow the root `AGENTS.md`.

## Module Boundaries

- Preserve the current Fastify, Supabase, and Zod stack. Do not introduce oRPC, Drizzle,
  TSyringe, neverthrow, or another parallel application stack unless a separate task adopts it.
- Group endpoints by feature in `src/modules/<feature>/routes.ts` and register them explicitly in `src/app.ts` under a clear prefix.
- Keep `src/index.ts` limited to configuration, app construction, startup, and fatal startup handling.
- Keep reusable Fastify capabilities in `src/plugins/`; decorate the app or request with typed declarations.
- Keep route handlers focused on HTTP concerns: authenticate, validate, call domain/data logic, and map the result to the API shape.
- Move reusable environment-neutral algorithms into a shared `@bnewapp/*` package. Do not duplicate rules between mobile and server.

## API Contracts

- Validate params, query strings, and bodies with Zod at the route boundary.
- Return successful payloads as `ApiSuccess<T>` (`{ data: T }`) using types exported by `@bnewapp/types`.
- Add shared request/response types before updating both client and server consumers.
- Keep error responses compatible with `ApiError`; use Fastify HTTP errors for expected client failures.
- Do not expose database errors, stack traces, secrets, or internal 5xx details. The global handler masks server failures.
- Use stable machine-readable error codes when a client needs distinct recovery behavior.

## Authentication and Data Access

- Add `preHandler: app.authenticate` to every protected route.
- Derive the authenticated user from `request.user.sub`; never accept an owner/user id from the client when it should be implied by the token.
- Use the singleton `app.supabase` service client registered by the plugin.
- Select only required columns and map snake_case database rows to camelCase API models at the boundary.
- Check both Supabase `error` and required `data`. Map absence and conflict to intentional 4xx errors where appropriate.
- Re-validate or reconcile domain invariants server-side even if the mobile client already validates them.

## Configuration and Operations

- Declare and validate environment variables in `src/config.ts` with Zod.
- Default safely: production-like environments must not silently allow all CORS origins or missing credentials.
- Keep logging structured and avoid tokens, secrets, or sensitive personal data.
- Do not perform network calls or create clients at module import time when app construction can own the lifecycle.

## Testing and Validation

- Use Vitest for route and pure module tests.
- Exercise routes through an injected Fastify app where practical; assert status and response contract.
- Cover authentication, invalid input, not-found/conflict behavior, Supabase failures, and the success path according to risk.

Run from the repository root:

```sh
corepack pnpm --filter @bnewapp/server typecheck
corepack pnpm --filter @bnewapp/server test
corepack pnpm --filter @bnewapp/server build
```
