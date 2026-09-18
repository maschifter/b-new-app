# Shared Package Guidelines

These rules apply to `packages/*`. Also follow the root `AGENTS.md`.

## Package Responsibilities

- `studio-core`: pure, deterministic studio domain types, compatibility rules, migration, coercion, reconciliation, catalog, and templates.
- `dance-core`: pure, deterministic dance domain rules — film steps, countdown and timing, scoring, and scan-status coercion.
- `types`: shared wire contracts plus generated Supabase database types. It must not own business behavior.
- `mobile-kit`: React Native package. Shared RN primitives, HTTP transport, the auth/query seam, MMKV and Jotai helpers, the Tailwind token preset, and the Jest harness for consuming apps and RN packages.
- `dance-flow`: React Native package. The record → upload → score flow: its transport, injected config, recorder adapter, score polling, flow atoms and the two screens that host them. It owns the flow, not the dance product surface — a catalog list, a post history or a feed belongs to the app that renders it.

## Boundaries

- Never import from `apps/*`.
- Keep shared domain packages free of React, React Native, Expo, Fastify, Supabase clients, storage, and environment access.
- **React Native exception.** `mobile-kit` and `dance-flow` are deliberately platform-coupled
  so `apps/mobile` and a second Expo app share one implementation of the primitives and flow
  they both render. The exception is limited to a package whose stated purpose above names
  it; every other package stays platform-neutral and takes app configuration by injection
  instead of importing app modules.
- **`dance-flow` carries one known leak — a deliberate trade for a smaller split, not a clean
  boundary.** `danceMoveDetailAtomFamily` lives in the package because its record screen reads
  it, and the app's staying `learn-dance-screen` reads it too; the app's catalog and
  post-history atoms likewise reach the package for its `./api` functions. Do not widen it: a
  new product atom with no in-package consumer belongs in the app.
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

**Source-only React Native packages** (`mobile-kit`, `dance-flow`) point runtime TypeScript
exports (`react-native`, `types`, `default`) at source and ship **no `build` script**.
Metro consumes that source through the `react-native` condition. Theme, Jest and Expo
config-plugin subpaths instead export JavaScript for configuration tools.

- `mobile-kit/config-plugins/` holds Expo config plugins both apps apply from their own
  `app.config.ts`. They are plain Node modules run by `expo prebuild`, not RN code, and a
  native-build workaround shared by two apps belongs here rather than duplicated per app.
- `mobile-kit` also owns the build configuration both apps would otherwise copy:
  `babel/expo-preset.js`, `metro/expo-app-config.js`, `tsconfig.expo-app.json` and
  `expo/app-config.js`. Each app keeps a one-line `babel.config.js` and
  `metro.config.js`, and an `app.config.ts` holding only the values that actually differ.
  Expo's config loader transpiles the `app.config.ts` entry alone and requires whatever it
  imports untransformed, so `expo/app-config.js` and everything it reaches are plain
  CommonJS with a sibling `.d.ts`; a rule the app and the config share
  (`api/published-api-url.js`) lives there and is re-exported by the TypeScript module, never
  copied.
- Still declare `typecheck` and `test`. Turbo only fans a task out to packages that declare
  it, so a missing script silently drops the package from `corepack pnpm typecheck`, leaving
  its sources checked only through a consuming app's looser tsconfig.
- Consumers typecheck the package's own sources under their tsconfig — `skipLibCheck` does
  not cover them — so a type error here surfaces in every app.
- Give each concern its own `exports` entry instead of one barrel. Metro does not tree-shake,
  so a barrel makes every consumer load, bundle and declare every native dependency the
  package has; two modules with disjoint native dependencies get separate entries.
- Keep every public subpath in `exports`; verify resolution in the consuming tool as well
  as TypeScript, since Metro, Tailwind, and Jest use different resolution conditions.
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

corepack pnpm --filter @bnewapp/dance-flow test
corepack pnpm --filter @bnewapp/dance-flow typecheck
```
