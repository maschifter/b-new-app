# Repository Guidelines

## Project Overview

BNewApp is a pnpm/Turborepo monorepo for a dance product:

- `apps/mobile`: Expo Router, React Native, Jotai, TanStack Query, Supabase Auth
- `apps/server`: Fastify API, Supabase service client, Zod, Vitest
- `packages/studio-core`: pure studio domain rules shared by mobile and server
- `packages/types`: shared API and generated database types
- `packages/utils`: genuinely cross-package utilities
- `supabase`: schema configuration and forward-only SQL migrations

Read the nearest scoped `AGENTS.md` before changing files in a subdirectory.

## Package Manager Safety

- Read the root `package.json#packageManager` before any package command.
- Use `corepack pnpm`, never bare `pnpm`; the pinned version is the repository contract.
- Confirm `corepack pnpm --version` matches the pinned version before the first package command. If Corepack cannot use its cache, request a writable cache or approval; do not fall back to a global pnpm.
- Run commands from the repository root unless a scoped rule explicitly says otherwise.
- Do not install, upgrade, or remove dependencies unless the task requires it.
- Do not regenerate a lockfile with a different pnpm version.

## Architecture Boundaries

Dependencies flow inward:

```text
apps/mobile ─┐
             ├──> packages/types, packages/studio-core, packages/utils
apps/server ─┘

supabase migrations ──> generated database types ──> apps/packages
```

- Apps may depend on packages. Packages must never import from apps.
- Mobile must not import server implementation files; communicate through HTTP and shared types.
- Server route modules must not contain reusable domain algorithms. Put environment-neutral rules in a focused package such as `@bnewapp/studio-core`.
- Keep shared packages platform-neutral unless their package purpose explicitly says otherwise.
- Add to `@bnewapp/utils` only after a concept is truly shared. Prefer feature-local code over premature abstraction.
- Avoid package cycles and deep imports into another package's private files; consume its public entry point.

## Coding Standards

- Use strict TypeScript. Do not introduce `any`, unchecked casts, or non-null assertions to silence errors.
- Validate untrusted input at boundaries. Keep internal code strongly typed after validation.
- Prefer small, named functions and explicit data flow over clever abstractions.
- Follow existing file naming, import extensions, aliases, and local patterns in the touched area.
- Keep route/screen entry files thin; move feature behavior into feature-owned modules.
- Do not add narrative comments describing the history of a fix. Comment only a non-obvious invariant, hidden constraint, unit, or workaround.
- Never edit generated files manually, including `packages/types/src/database.generated.ts`.
- Never commit secrets. `EXPO_PUBLIC_*` values are public and must not contain privileged credentials.

## Change Workflow

1. Inspect the target file, its callers, its tests, and its nearest `AGENTS.md`.
2. Identify the owning layer before editing. Do not solve a boundary problem with a cross-layer import.
3. Make the smallest complete change. Do not perform unrelated cleanup.
4. Add or update focused tests for behavior changes.
5. Run the narrowest relevant checks, then expand based on risk.

Useful repository checks:

```sh
corepack pnpm --version
corepack pnpm typecheck
corepack pnpm test
corepack pnpm lint
```

For a single workspace, prefer `corepack pnpm --filter <package-name> <script>`.

## Test and Review Expectations

- Test observable behavior and domain invariants, not implementation details.
- Pure domain changes require unit tests in the owning package.
- API changes require success, validation, authorization, and meaningful failure coverage as applicable.
- Mobile UI/state changes require focused component or state tests and device verification when visible behavior changes.
- Report the exact commands run and any checks that could not run.

## Database Safety

- SQL migrations are the source of truth for schema changes.
- Treat `db:push`, remote Supabase commands, and type generation against a linked project as external state changes. Obtain explicit approval before running them.
- Prefer additive, backward-compatible migrations. Never rewrite a migration already applied outside local development.
- Review authorization and Row Level Security implications for every user-owned table.

## Git Conventions

- Preserve unrelated user changes in a dirty worktree.
- Use Conventional Commit style when asked to commit, for example `feat(mobile): add crew invite flow`.
- Include validation notes and screenshots or recordings for visible mobile changes.
