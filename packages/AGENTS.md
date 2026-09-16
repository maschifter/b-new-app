# Shared Package Guidelines

These rules apply to `packages/*`. Also follow the root `AGENTS.md`.

## Package Responsibilities

- `studio-core`: pure, deterministic studio domain types, compatibility rules, migration, coercion, reconciliation, catalog, and templates.
- `dance-core`: pure, deterministic dance domain rules — film steps, countdown and timing, scoring, and scan-status coercion.
- `types`: shared wire contracts plus generated Supabase database types. It must not own business behavior.
- `mobile-kit`: React Native package. Shared RN primitives, HTTP transport, the auth/query seam, MMKV and jotai helpers, the Tailwind token preset, and the jest harness both apps run on.

## Boundaries

- Never import from `apps/*`.
- Keep shared domain packages free of React, React Native, Expo, Fastify, Supabase clients, storage, and environment access.
- **React Native exception.** `mobile-kit` is deliberately platform-coupled: it exists so `apps/mobile` and a second Expo app share one implementation of the primitives and flow they both render, which a platform-neutral package cannot hold. The exception is limited to packages whose stated purpose names it. Every other package stays platform-neutral.
- Expose consumers through the package's declared `exports` entries. A package may have several, one per concern; reaching past them into a private file is still a deep import.
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

Packages fall into two shapes. Follow the one the package uses; do not mix them.

**Compiled packages** (`studio-core`, `dance-core`, `types`) emit declarations to `dist` and
declare a `build` script.

- Export only supported public symbols from `src/index.ts`.
- Preserve the ESM/import-extension conventions already used by the package.
- Build an edited package before typechecking downstream consumers when its emitted
  declarations are required.

**Source-only React Native packages** (`mobile-kit`) point every `exports` condition
(`react-native`, `types`, `default`) at TypeScript source and ship **no `build` script**.
Metro consumes the source through the `react-native` condition, and declarations for `.tsx`
buy nothing.

- Still declare `typecheck` and `test`. Turbo only fans a task out to packages that declare
  it, so a missing script silently drops the package from `corepack pnpm typecheck`, leaving
  its sources checked only through a consuming app's looser tsconfig.
- Consumers typecheck the package's own sources under their tsconfig — `skipLibCheck` does
  not cover them — so a type error here surfaces in every app.
- Give each concern its own `exports` entry instead of one barrel. Metro does not tree-shake,
  so a barrel makes every consumer load, bundle and declare every native dependency the
  package has; two modules with disjoint native dependencies get separate entries.
- An `exports` map is a closed door: a subpath that is not listed is not importable, and the
  failure is a resolution error at Metro or Tailwind startup, not at typecheck.
- Entries a config file reaches through CJS `require` (the theme tokens, the Tailwind preset,
  the jest harness) must resolve to plain `.js`, outside the source-only TypeScript entries.
- Testing an RN package needs its own `babel.config.js` — babel-jest resolves the config from
  the file's own package root — plus `jest`, `jest-expo` and `babel-preset-expo` as its own
  devDependencies. `corepack pnpm test` then runs two different runners under one task name.
- A jest config fragment shipped from a package cannot use `<rootDir>`, which resolves to the
  consuming project; every path it contributes is a `require.resolve` relative to the fragment.
  `preset` is singular, so the fragment is a spreadable object merged beside `preset: "jest-expo"`,
  not a preset of its own.
- Jest auto-applies a manual mock for a `node_modules` module only from
  `<rootDir>/__mocks__/<module>.js`, which no package path can satisfy. The package owns the
  implementation; every consuming project keeps a one-line re-export at that path.

Add tests beside the code under `src/__tests__` or the package's established test location.

Typical validation:

```sh
corepack pnpm --filter @bnewapp/studio-core test
corepack pnpm --filter @bnewapp/studio-core typecheck
corepack pnpm --filter @bnewapp/studio-core build

corepack pnpm --filter @bnewapp/mobile-kit test
corepack pnpm --filter @bnewapp/mobile-kit typecheck
```
