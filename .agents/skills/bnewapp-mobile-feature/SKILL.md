---
name: bnewapp-mobile-feature
description: Implement or refactor BNewApp Expo/React Native features using feature-owned UI, thin Expo Router routes, selective Suspense query boundaries, concern-based `_atoms`, Jotai/TanStack Query state, shared domain packages, tests, accessibility, and device verification. Use for work under apps/mobile, including screens, components, loading and error states, navigation, state, API integration, persistence, lists, gestures, animations, and visible mobile behavior.
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
- Keep feature endpoint functions in `src/features/<feature>/api.ts` over the shared transport in
  `src/lib/api/client.ts`.
- Keep reusable mobile primitives in `src/components` only after more than one feature needs the same concept.
- Keep mobile infrastructure in `src/lib`.
- Put rules that mobile and server must enforce identically in a pure `@bnewapp/*` package.
- Put wire types in `@bnewapp/types`; do not import server implementation into mobile.

Use the smallest structure that fits. Add `_atoms/queries.ts`, `mutations.ts`, `ui.ts`,
`effects.ts`, or `forms.ts` only when the feature needs that concern. Do not create placeholder files.
Keep nested UI out of route files. Keep a component feature-local until it is a genuine primitive or
has real consumers in multiple features; do not promote components based only on visual similarity.

## Implement the Vertical Slice

1. Define or update shared domain and wire types before their consumers when the contract changes.
2. Keep the Expo Router file thin and render a feature-owned screen.
3. Choose state deliberately:
   - local React state for one component subtree;
   - plain Jotai atoms for shared, persistent, or selectively subscribed client state;
   - `jotai-tanstack-query` atoms for server reads, retries, invalidation, pagination, and mutations.
4. Separate persistent domain state from transient UI state. Version persisted keys and preserve migration/coercion paths.
5. Use the root provider's exact stable `QueryClient` for hooks and query atoms. Scope every
   authenticated query key by `userId` and preserve the centralized auth-transition cleanup.
6. Subscribe components only to values they render. Split atoms by concern under `_atoms/`
   rather than wrapping all behavior in one monolithic hook.
7. Keep query results in the query cache. Use derived atoms for transformed views instead of
   copying remote data into a second plain Jotai atom.
8. Validate and reconcile data at the appropriate boundary. Never rely on the client for authorization.
9. Add accessibility semantics and account for safe areas, keyboards, loading, empty, error, and offline states that apply to the request.

## Compose UI and Loading Boundaries

1. Make the route import a feature screen through the feature's public `index.ts`.
2. Split a growing screen into named feature-owned files under `ui/` by responsibility, such as
   list feedback, row rendering, screen layout, skeleton, or header. Do not extract tiny markup that
   has no independent responsibility.
3. Use `StyleSheet.create` and existing React Native primitives. Do not copy CardNexus NativeWind
   `className` usage until BNewApp has an approved NativeWind migration and updated scoped rules.
4. For a query-backed initial load, use Suspense only when the entire bounded content cannot render
   meaningfully without the query. Place a layout-matched skeleton in the nearest useful `Suspense` fallback.
5. Put a query-aware error boundary outside that Suspense boundary and provide an accessible retry.
   Ensure retry clears TanStack error state and invalidates a cached rejected Jotai suspense promise.
6. Use suspense query atoms only below guards that guarantee required auth/params exist; suspense query
   atoms are always enabled. Keep non-suspense queries with `enabled` when inputs may be absent.
7. Keep explicit `isPending`/`isFetching` UI for mutations, submissions, refresh, background fetching,
   and next-page loading so existing content remains mounted.
8. Test initial skeleton, success, empty/not-found, error, and successful retry. Use RNTL's async render
   APIs for React 19 components that suspend.

## Keep Rendering Efficient

- Keep render paths pure and list-item work small.
- Use stable keys and stable layout dimensions.
- Avoid memoization by default; add it for measured work or required stable identities.
- Use Reanimated for per-frame or gesture-driven animation work.
- For feeds, use the appropriate `atomWithInfiniteQuery` variant, server cursors, and a derived
  flattened-items atom. Suspense may own the first page; pagination remains explicit incremental loading.

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
