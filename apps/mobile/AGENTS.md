# Mobile Guidelines

These rules apply to `apps/mobile`. Also follow the root `AGENTS.md`.

## Scope and Workflow

- This is an Expo 54 / React Native 0.81 app using Expo Router and generated native projects.
- Treat `src/app` as routing composition, not the feature implementation layer.
- Put feature code in `src/features/<feature>/`; put truly shared primitives in `src/components/` and infrastructure in `src/lib/`.
- Native folders are generated and gitignored. Prefer `app.config.ts`, Expo config plugins, or package configuration; do not rely on hand edits that `prebuild --clean` will erase.
- Use `@/*` for mobile-local imports and public `@bnewapp/*` package exports for workspace code.

## Feature Structure

Use a narrow feature entry point and only the folders the feature needs. New features that
need shared state split atoms by concern under `_atoms/`; the existing studio `state/` folder
predates this convention and remains a useful reference for persistence and synchronization:

```text
src/features/<feature>/
├── index.ts
├── data/        # static catalog/config or data adapters
├── _atoms/      # jotai-tanstack-query server state plus client/UI atoms, split by concern
├── ui/          # screens and feature-owned components
├── api.ts       # feature endpoint functions over the shared API transport
└── __tests__/   # or tests colocated below the relevant folder
```

- Do not create empty folders or atom files. Small features may not need `_atoms/` at all.
- Inside `_atoms/`, use concern-based files such as `queries.ts`, `mutations.ts`, `ui.ts`,
  `effects.ts`, or `forms.ts`; add only the files the feature actually uses.
- Keep Expo Router files thin: parse route params, enforce navigation concerns, and render a feature screen.
- Declare authenticated routes outside the protected tabs inside the `session !== null`
  `Stack.Protected` block in `src/app/_layout.tsx`; filesystem discovery is not an auth guard.
- Export a narrow public surface from the feature `index.ts`; do not let unrelated features deep-import internals.
- Keep route/navigation objects out of reusable feature components. Pass callbacks or typed values at the boundary.

## State Ownership

- Use `jotai-tanstack-query` query and mutation atoms for feature-owned remote server state.
- Use plain Jotai atoms for shared or fine-grained client state; use local React state for state owned by one component subtree.
- Hydrate `jotai-tanstack-query`'s `queryClientAtom` with the exact stable `QueryClient` used by
  the root `QueryClientProvider`; hooks and query atoms must share one cache.
- Keep query results in the query cache. Do not copy query data into a second plain Jotai atom;
  expose derived atoms when consumers need a transformed view such as flattened pages.
- Keep persistent atoms separate from ephemeral UI atoms.
- Prefer focused atoms and direct subscriptions (`useAtomValue`, `useSetAtom`, `useAtom`) so components subscribe only to data they render.
- Split growing state by concern: `queries.ts`, `mutations.ts`, `ui.ts`, `effects.ts`, or `forms.ts`. Do not create empty ceremony for small features.
- Put pure transforms and invariants in a platform-neutral shared package when both mobile and server must agree.
- Use effects only for synchronization with external systems. Derive values during render or in atoms when possible.

## Lists and Feeds

- Use `atomWithInfiniteQuery` with server-provided cursor pagination for paginated feeds.
- Derive the rendered list by flattening query pages; never derive the next cursor from item or page counts.
- If server reconciliation can return an empty page with a non-null cursor, advance one guarded
  page at a time until a page contributes items or reaches a null cursor.
- Compose list screens as screen, list, and feature-owned item components. Handle pending, empty,
  error, refresh, and next-page loading states explicitly.
- Use stable item keys. Add clipping, windowing, or memoization only when appropriate for the
  rendered content and verified behavior.

## UI and Performance

- Use React Native components and `StyleSheet.create` consistently with neighboring code.
- Provide accessibility roles, labels, states, and reasonable touch targets for interactive controls.
- Respect safe areas and keyboard behavior; do not hardcode device-specific offsets.
- Keep render paths pure. Memoize only when measurement or stable identity requirements justify it.
- Avoid allocating expensive derived collections in list-item render paths; derive once or move work to selectors.
- Use `expo-image` for non-trivial remote images and provide stable dimensions to prevent layout shifts.
- Use Reanimated for gesture-driven or UI-thread animations; do not put React state updates in per-frame callbacks.

## Auth, API, and Persistence

- Access auth through `src/lib/auth`; do not create feature-local Supabase clients.
- Keep the shared API transport and URL/auth mechanics in `src/lib/api/client.ts`; put
  feature-specific endpoint functions in `src/features/<feature>/api.ts`.
- Authenticated query atoms read the `{ userId, accessToken }` projection owned by `src/lib/auth`.
  Include `userId` in every user-scoped query key. On sign-out or user replacement, disable and
  cancel the previous user's queries and remove their cache entries before enabling the next user.
  A same-user token refresh updates the token without changing cache identity.
- Keep service secrets out of mobile code. Every `EXPO_PUBLIC_*` value is visible to users.
- Namespace persisted MMKV keys by feature and schema version. Add migration/coercion when persisted shapes evolve.
- Never treat cached client data as authorization; the server and database enforce ownership.

## Validation

Run from the repository root:

```sh
corepack pnpm --filter @bnewapp/mobile typecheck
corepack pnpm --filter @bnewapp/mobile test
corepack pnpm lint
```

For visible behavior changes, launch the app on an available simulator/emulator and verify the affected flow with Argent when available. Follow the configured Argent skills for discovery, interaction, and UI-flow testing.
