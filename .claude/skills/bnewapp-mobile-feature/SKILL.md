---
name: bnewapp-mobile-feature
description: Implement or refactor BNewApp Expo/React Native features under apps/mobile. Use for screens, components, loading and error states, navigation, state, API integration, lists, gestures, animations, or any visible mobile behavior. Enforces thin Expo Router routes, feature-owned UI, selective Suspense query boundaries, Jotai/TanStack Query conventions, StyleSheet styling, tests, accessibility, and device verification.
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# BNewApp mobile feature

This Claude skill is the discovery entry point. The canonical instructions are shared with the
other repository agents so the mobile architecture does not drift.

Before editing, read these files completely and follow them in this order:

1. `AGENTS.md`
2. `apps/mobile/AGENTS.md`
3. `.agents/skills/bnewapp-mobile-feature/SKILL.md`
4. `.agents/skills/bnewapp-mobile-feature/references/current-patterns.md`

Treat the `.agents` skill and reference as the source of truth. If this wrapper conflicts with
them, follow the canonical files and update this wrapper in the same change.

## Non-negotiable UI conventions

- Keep `apps/mobile/src/app` routes thin. Route files compose providers, guards, and feature entry
  points; they do not own screen UI.
- Put UI in `src/features/<feature>/ui` by default. Promote a component to `src/components` only
  after it is domain-neutral and has multiple real feature consumers.
- Use selective Suspense for initial query reads. Pair every suspense query subtree with the
  shared query error boundary and an accessible retry action.
- Keep authentication and required-parameter guards above Suspense. A suspense query atom is
  always enabled once its guarded subtree mounts.
- Use explicit loading states for refresh, pagination, background fetches, mutations, and forms.
- When a derived atom reads a suspense query atom, await the query result before deriving data.
- Test skeleton, success, empty, error, and retry behavior where applicable.
- Use React Native `StyleSheet` for new UI. Do not introduce NativeWind `className` usage until an
  explicitly approved migration establishes and verifies the full mobile toolchain and updates
  the canonical rules.
- Run focused tests and typecheck, then verify visible behavior on a simulator or emulator.

Do not copy CardNexus structures mechanically. Use CardNexus as a reference for intent, then
adapt the implementation to BNewApp's current dependencies and canonical mobile architecture.
