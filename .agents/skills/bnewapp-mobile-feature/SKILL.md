---
name: bnewapp-mobile-feature
description: Implement or refactor BNewApp Expo/React Native features using the repository's feature folders, thin Expo Router routes, Jotai client state, TanStack Query server state, shared domain packages, tests, accessibility, and device verification. Use for work under apps/mobile, including screens, navigation, state, API integration, persistence, lists, gestures, animations, and visible mobile behavior.
---

# BNewApp Mobile Feature

Implement mobile work without breaking the repository's ownership boundaries or introducing a second architecture.

## Load Context

1. Resolve the repository root with `git rev-parse --show-toplevel`, then read `<repo-root>/AGENTS.md` and `<repo-root>/apps/mobile/AGENTS.md` completely.
2. Read [references/current-patterns.md](references/current-patterns.md).
3. Inspect the target route, feature public entry point, related state/UI, API client calls, shared types/domain code, and focused tests.
4. If behavior crosses the API or database, also read the corresponding scoped `AGENTS.md` and use the matching BNewApp skill.

## Choose the Owner

- Keep route parsing and navigation composition in `src/app`.
- Keep feature-specific screen, state, data, and UI code in `src/features/<feature>`.
- Keep reusable mobile primitives in `src/components` only after more than one feature needs the same concept.
- Keep mobile infrastructure in `src/lib`.
- Put rules that mobile and server must enforce identically in a pure `@bnewapp/*` package.
- Put wire types in `@bnewapp/types`; do not import server implementation into mobile.

Use the smallest structure that fits. Do not create `data`, `state`, or `ui` folders with placeholder files.

## Implement the Vertical Slice

1. Define or update shared domain and wire types before their consumers when the contract changes.
2. Keep the Expo Router file thin and render a feature-owned screen.
3. Choose state deliberately:
   - local React state for one component subtree;
   - Jotai for shared, persistent, or selectively subscribed client state;
   - TanStack Query for server state, retries, invalidation, and mutations.
4. Separate persistent domain state from transient UI state. Version persisted keys and preserve migration/coercion paths.
5. Subscribe components only to values they render. Split a growing atom module by concern rather than wrapping all behavior in one monolithic hook.
6. Validate and reconcile data at the appropriate boundary. Never rely on the client for authorization.
7. Add accessibility semantics and account for safe areas, keyboards, loading, empty, error, and offline states that apply to the request.

## Keep Rendering Efficient

- Keep render paths pure and list-item work small.
- Use stable keys and stable layout dimensions.
- Avoid memoization by default; add it for measured work or required stable identities.
- Use Reanimated for per-frame or gesture-driven animation work.
- Do not mirror query data into Jotai without a concrete offline, editing, or persistence requirement.

## Test and Verify

1. Add the narrowest useful unit, state, or React Native Testing Library tests.
2. Run:

```sh
corepack pnpm --filter @bnewapp/mobile typecheck
corepack pnpm --filter @bnewapp/mobile test
corepack pnpm lint
```

3. For visible changes, use the available Argent workflow: inspect the environment, launch the app, discover targets before interaction, exercise the affected flow, and verify the resulting UI. Use screenshot diffing when visual stability is material.
4. Report commands, UI scenarios, and anything not verified.

Do not run a clean prebuild, change native generated files, install dependencies, or mutate external services unless the task requires it and the user authorizes the consequential action.
