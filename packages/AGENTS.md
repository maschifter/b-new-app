# Shared Package Guidelines

These rules apply to `packages/*`. Also follow the root `AGENTS.md`.

## Package Responsibilities

- `studio-core`: pure, deterministic studio domain types, compatibility rules, migration, coercion, reconciliation, catalog, and templates.
- `types`: shared wire contracts plus generated Supabase database types. It must not own business behavior.
- `utils`: small utilities proven useful across multiple packages or apps. Do not use it as a miscellaneous dumping ground.

## Boundaries

- Never import from `apps/*`.
- Keep shared domain packages free of React, React Native, Expo, Fastify, Supabase clients, storage, and environment access.
- Expose consumers through the package `src/index.ts`; avoid deep imports across packages.
- Keep imports acyclic. A lower-level package must not depend on an application-facing package merely to reuse a type.
- Prefer one focused package over a broad `core` package when a new domain becomes substantial.

## Domain Design

- Keep functions pure and deterministic when possible.
- Encode important invariants in types and validate external or persisted data explicitly.
- When stored shapes evolve, preserve a versioned migration chain and test old-to-current upgrades.
- Reconcile persisted input against current designer-owned configuration before use.
- Keep server and mobile behavior identical by sharing the rule, not by copying implementations.
- Use explicit domain names; avoid generic helpers and speculative abstractions.

## Public API and Builds

- Export only supported public symbols from `src/index.ts`.
- Preserve ESM/import-extension conventions already used by the package.
- Add tests beside domain code under `src/__tests__` or the package's established test location.
- Build an edited package before typechecking downstream consumers when its emitted declarations are required.

Typical validation:

```sh
corepack pnpm --filter @bnewapp/studio-core test
corepack pnpm --filter @bnewapp/studio-core typecheck
corepack pnpm --filter @bnewapp/studio-core build
```
