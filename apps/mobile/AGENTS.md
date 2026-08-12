# Mobile Guidelines

These rules apply to `apps/mobile`. Also follow the root `AGENTS.md`.

## Scope and Workflow

- This is an Expo 54 / React Native 0.81 app using Expo Router and generated native projects.
- Treat `src/app` as routing composition, not the feature implementation layer.
- Put feature code in `src/features/<feature>/`; put truly shared primitives in `src/components/` and infrastructure in `src/lib/`.
- Native folders are generated and gitignored. Prefer `app.config.ts`, Expo config plugins, or package configuration; do not rely on hand edits that `prebuild --clean` will erase.
- Use `@/*` for mobile-local imports and public `@bnewapp/*` package exports for workspace code.

## Feature Structure

Follow the existing studio feature as the default shape, using only folders the feature needs:

```text
src/features/<feature>/
├── index.ts
├── data/        # static catalog/config or data adapters
├── state/       # Jotai atoms, providers, sync and effects
├── ui/          # screens and feature-owned components
└── __tests__/   # or tests colocated below the relevant folder
```

- Keep Expo Router files thin: parse route params, enforce navigation concerns, and render a feature screen.
- Export a narrow public surface from the feature `index.ts`; do not let unrelated features deep-import internals.
- Keep route/navigation objects out of reusable feature components. Pass callbacks or typed values at the boundary.

## State Ownership

- Use TanStack Query for remote server state and request lifecycle.
- Use Jotai for shared or fine-grained client state; use local React state for state owned by one component subtree.
- Keep persistent atoms separate from ephemeral UI atoms.
- Prefer focused atoms and direct subscriptions (`useAtomValue`, `useSetAtom`, `useAtom`) so components subscribe only to data they render.
- Split growing state by concern: `queries.ts`, `mutations.ts`, `ui.ts`, `effects.ts`, or `forms.ts`. Do not create empty ceremony for small features.
- Put pure transforms and invariants in a platform-neutral shared package when both mobile and server must agree.
- Use effects only for synchronization with external systems. Derive values during render or in atoms when possible.

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
- Send authenticated server requests through `src/lib/api/client.ts` or a focused extension beside it.
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
