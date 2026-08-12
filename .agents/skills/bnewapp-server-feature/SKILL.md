---
name: bnewapp-server-feature
description: Implement or refactor BNewApp Fastify API features using feature route modules, Zod boundary validation, Supabase data access, shared API types, authenticated ownership, safe errors, and Vitest coverage. Use for endpoints, route registration, plugins, auth, configuration, server-side domain enforcement, API contract changes, or work under apps/server.
---

# BNewApp Server Feature

Build a contract-led Fastify vertical slice that keeps HTTP, domain, and data concerns in their owning layers.

## Load Context

1. Resolve the repository root with `git rev-parse --show-toplevel`, then read `<repo-root>/AGENTS.md` and `<repo-root>/apps/server/AGENTS.md` completely.
2. Read [references/current-patterns.md](references/current-patterns.md).
3. Inspect the target module, `src/app.ts`, shared API/domain types, relevant database migration/types, mobile client consumer, and tests.
4. For schema changes, read `<repo-root>/supabase/AGENTS.md` and use `$bnewapp-database-change`.

## Design the Contract First

1. Define request and response semantics, authorization, status codes, and stable client-relevant error codes.
2. Add or update shared wire types in `@bnewapp/types` when both app and server consume them.
3. Add Zod schemas at the untrusted HTTP boundary. Do not treat TypeScript assertions as runtime validation.
4. Put domain invariants shared with mobile in a pure package such as `@bnewapp/studio-core`.

Do not introduce oRPC, Drizzle, TSyringe, neverthrow, or another parallel application stack unless a separate task intentionally adopts those technologies. Preserve the architectural intent with the current Fastify, Supabase, and Zod stack.

## Implement the Route

1. Add the endpoint to `src/modules/<feature>/routes.ts`, or create the focused module.
2. Protect private routes with `preHandler: app.authenticate`.
3. Derive ownership from `request.user.sub` whenever the authenticated user is the owner.
4. Parse params, query, and body before data access.
5. Use `app.supabase`, select only required columns, check `error` and expected `data`, and map rows to camelCase API models.
6. Enforce domain invariants on the server even when the client already checks them.
7. Return `{ data: ... }` for success and intentional Fastify HTTP errors for expected failures.
8. Register new modules explicitly in `src/app.ts` with the correct prefix.
9. Update the mobile API client and query/mutation consumer when delivering an end-to-end feature.

## Handle Failures Safely

- Distinguish invalid input, unauthenticated, forbidden, not found, conflict, and internal failures.
- Keep 5xx messages generic outside server logs.
- Never log access tokens, secret keys, or sensitive data.
- Avoid catching an error only to discard its classification or return a success-shaped response.

## Test and Verify

Add focused Vitest tests for the relevant combination of success, invalid input, missing/invalid auth, ownership, not found/conflict, and Supabase failure.

Run:

```sh
corepack pnpm --filter @bnewapp/server typecheck
corepack pnpm --filter @bnewapp/server test
corepack pnpm --filter @bnewapp/server build
corepack pnpm lint
```

If shared packages changed, build and test them before downstream validation. Report the exact checks and any unverified external integration.
