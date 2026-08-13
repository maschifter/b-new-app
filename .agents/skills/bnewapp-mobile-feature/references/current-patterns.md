# Current Mobile Patterns

Use these files as live examples; read the files rather than copying snippets blindly.

## Go-Forward Standard

New features split needed state concerns under `_atoms/` and use `jotai-tanstack-query` atoms
for server state. Plain Jotai atoms own client/UI state. Feature endpoint functions live in the
feature's `api.ts` over the shared transport in `src/lib/api/client.ts`.

Follow `apps/mobile/AGENTS.md` as the authoritative rule set. Explore now demonstrates the current
query-backed screen structure; inspect live files instead of copying snippets blindly.

## Routing and Feature Boundary

- `apps/mobile/src/app/(tabs)/studio.tsx`: thin route composition, auth-derived owner, navigation callback
- `apps/mobile/src/features/studio/index.ts`: narrow feature exports
- `apps/mobile/src/features/studio/ui/studio-screen.tsx`: feature screen with route-agnostic callbacks
- `apps/mobile/src/app/(tabs)/crew.tsx`: route that only exports a feature screen
- `apps/mobile/src/features/crew/index.ts`: public feature boundary
- `apps/mobile/src/features/crew/ui/crew-screen.tsx`: feature-owned placeholder UI
- `apps/mobile/src/features/auth/index.ts`: public Auth screen exports
- `apps/mobile/src/features/auth/ui/sign-out-button.tsx`: auth-only control kept out of shared components

## Component Placement

- `apps/mobile/src/components/bouncable-press.tsx`: shared interaction primitive used by several features
- `apps/mobile/src/components/screen.tsx`: shared screen shell used across features
- `apps/mobile/src/features/explore/ui/explore-list-feedback.tsx`: feature-owned pagination feedback
- `apps/mobile/src/features/explore/ui/explore-room-layout.tsx`: feature-owned room header and message layout

Keep components in a feature until multiple features need the same semantic concept. A one-feature
control does not become common merely because it could theoretically be reused.

## Selective Suspense

- `apps/mobile/src/features/explore/_atoms/queries.ts`: suspense query and infinite-query atoms below protected routes
- `apps/mobile/src/features/explore/_atoms/ui.ts`: async derived atom that awaits suspense query data
- `apps/mobile/src/features/explore/ui/explore-screen.tsx`: initial feed Suspense boundary; explicit refresh and pagination state
- `apps/mobile/src/features/explore/ui/explore-room-screen.tsx`: detail Suspense boundary with not-found content
- `apps/mobile/src/components/error-boundary/mobile-query-error-boundary.tsx`: shared query error/retry boundary
- `apps/mobile/src/lib/react-query/query-error-reset.ts`: reset revision for rejected Jotai suspense promises
- `apps/mobile/src/features/explore/ui/__tests__/explore-screen.test.tsx`: React 19 async render and retry recovery coverage

Use Suspense for the first meaningful query read, not for refresh, pagination, mutations, or form submission.
Every suspense region needs a skeleton and query-aware error boundary. Authenticated suspense atoms must
only mount after the protected route and auth projection are ready because suspense query APIs force `enabled`.

## Styling Contract

BNewApp uses NativeWind for static component styling. Keep `style` for runtime-computed values,
animated styles, and components without NativeWind interop. Shared colors belong in
`apps/mobile/tailwind.config.js`; use semantic token classes instead of repeating raw values.

## Legacy Studio State and Synchronization

- `apps/mobile/src/features/studio/state/atoms.ts`: persisted and ephemeral Jotai atoms keyed by owner
- `apps/mobile/src/features/studio/state/studio-provider.tsx`: small configuration context over atomic state
- `apps/mobile/src/features/studio/state/studio-sync.tsx`: TanStack Query synchronization around local persisted state
- `apps/mobile/src/lib/jotai/atom-with-mmkv.ts`: persistence adapter

Keep the useful principles: narrow subscriptions, explicit ownership, persisted-shape coercion, and server convergence. Do not reproduce the studio sync machinery for a feature that only needs an ordinary query or mutation.

Studio predates `_atoms/` and `jotai-tanstack-query`. Do not use its `state/` folder, direct
query hooks, or imperative sync component as the structure for a new feature.

## API and Auth

- `apps/mobile/src/lib/api/client.ts`: API URL resolution, bearer token, shared response types
- `apps/mobile/src/lib/auth/session-provider.tsx`: session ownership
- `apps/mobile/src/lib/providers/query-provider.tsx`: shared QueryClient lifecycle

The endpoint functions currently in `src/lib/api/client.ts` predate the feature-owned `api.ts`
standard. Keep shared transport concerns there, but put new feature endpoint functions in the
owning feature. Do not create feature-local Supabase or QueryClient instances.

## Testing

- `apps/mobile/src/features/studio/state/__tests__/atoms.test.ts`
- `apps/mobile/src/features/studio/state/__tests__/studio-sync.test.tsx`
- `apps/mobile/src/features/studio/ui/__tests__/studio-flow.test.tsx`

Test domain transitions and user-visible behavior. Avoid assertions tied only to internal hook or atom implementation.
