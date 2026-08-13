# Current Mobile Patterns

Use these files as live examples; read the files rather than copying snippets blindly.

## Go-Forward Standard

New features split needed state concerns under `_atoms/` and use `jotai-tanstack-query` atoms
for server state. Plain Jotai atoms own client/UI state. Feature endpoint functions live in the
feature's `api.ts` over the shared transport in `src/lib/api/client.ts`.

No implemented feature is yet a complete structural example of this standard. Follow
`apps/mobile/AGENTS.md` for the authoritative shape and inspect live files only for the smaller
patterns called out below.

## Routing and Feature Boundary

- `apps/mobile/src/app/(tabs)/studio.tsx`: thin route composition, auth-derived owner, navigation callback
- `apps/mobile/src/features/studio/index.ts`: narrow feature exports
- `apps/mobile/src/features/studio/ui/studio-screen.tsx`: feature screen with route-agnostic callbacks

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
