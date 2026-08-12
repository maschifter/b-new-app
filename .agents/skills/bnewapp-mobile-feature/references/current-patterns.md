# Current Mobile Patterns

Use these files as live examples; read the files rather than copying snippets blindly.

## Routing and Feature Boundary

- `apps/mobile/src/app/(tabs)/studio.tsx`: thin route composition, auth-derived owner, navigation callback
- `apps/mobile/src/features/studio/index.ts`: narrow feature exports
- `apps/mobile/src/features/studio/ui/studio-screen.tsx`: feature screen with route-agnostic callbacks

## State and Synchronization

- `apps/mobile/src/features/studio/state/atoms.ts`: persisted and ephemeral Jotai atoms keyed by owner
- `apps/mobile/src/features/studio/state/studio-provider.tsx`: small configuration context over atomic state
- `apps/mobile/src/features/studio/state/studio-sync.tsx`: TanStack Query synchronization around local persisted state
- `apps/mobile/src/lib/jotai/atom-with-mmkv.ts`: persistence adapter

Keep the useful principles: narrow subscriptions, explicit ownership, persisted-shape coercion, and server convergence. Do not reproduce the studio sync machinery for a feature that only needs an ordinary query or mutation.

## API and Auth

- `apps/mobile/src/lib/api/client.ts`: API URL resolution, bearer token, shared response types
- `apps/mobile/src/lib/auth/session-provider.tsx`: session ownership
- `apps/mobile/src/lib/providers/query-provider.tsx`: shared QueryClient lifecycle

Extend the existing client pattern or split it into focused endpoint modules when its size justifies that change. Do not create feature-local Supabase or QueryClient instances.

## Testing

- `apps/mobile/src/features/studio/state/__tests__/atoms.test.ts`
- `apps/mobile/src/features/studio/state/__tests__/studio-sync.test.tsx`
- `apps/mobile/src/features/studio/ui/__tests__/studio-flow.test.tsx`

Test domain transitions and user-visible behavior. Avoid assertions tied only to internal hook or atom implementation.
