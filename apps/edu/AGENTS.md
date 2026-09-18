# Stepz (apps/edu) Guidelines

These rules apply to `apps/edu`. Also follow the root `AGENTS.md`.

`apps/edu` is the second Expo app in this monorepo: a simpler, feed-first dance
product built on the same shared packages as `apps/mobile`. Where this guide is
silent, `apps/mobile/AGENTS.md` describes the same Expo Router / Jotai /
TanStack Query conventions and applies here too.

## What makes this app different

- **No accounts.** There is no sign-up, no login and no profile sync. The device
  receives a Supabase **anonymous** identity on first launch
  (`src/lib/auth/session-provider.tsx`) purely so the shared owner-scoped dance API
  can be reused unchanged. Never surface an account, an email or a user id in the UI.
- **Profile data is local.** Learned moves, saved scores and personal recordings live
  in MMKV and never leave the device. Persist through `persistedEduAtom`
  (`src/lib/jotai/atom-with-mmkv.ts`): store id `edu`, namespace `edu:v1:`, **keyed by
  content id (`moveId`, style id) and never by an owner id** — the anonymous session
  can be lost and replaced, and local data must survive that.
- **Two video concepts must stay apart** in code, and no copy may blur them:
  - *Temporary scan upload* — required, goes to Supabase Storage so the scan worker can
    score it, deleted once the score is terminal.
  - *Personal recording* — optional, device-only, never uploaded.
  Do not let one code path serve both. **v1 ships no upload disclosure** — an owner decision
  recorded in `plans/educational-app-features.md` §3.3 — so the rule on copy is a negative
  one: no string may state or imply that a recorded clip stays on the device. Saying nothing
  about the upload is the decision; claiming the opposite is not covered by it.
- **No analytics.** Do not add an event pipeline to this app.
- The catalog (`dance_moves`, `dance_genres`, `music_tracks`) is shared with
  `apps/mobile` and managed by the existing admin panel. This app reads it; it does not
  own it.
- `GET /api/user/me` answers `404` for an anonymous caller by design — anonymous users
  have no `profiles` row. Do not call it.

## Structure

```text
src/
├── app/            # Expo Router tree, routing composition only
├── features/       # feed, scan, profile, dev-menu — narrow index.ts, _atoms/ + ui/ as needed
└── lib/            # api transport, auth, bootstrap, persistence, catalog
```

There is deliberately no `src/components/`: every primitive both apps render lives in
`@bnewapp/mobile-kit/ui`. Add one there, not here, unless it is genuinely Stepz-only.

- Routes parse and validate params (`isUuidParam` from `@bnewapp/mobile-kit`) and hand off
  to a feature screen.
  No screen UI, list feedback or feature controls in a route file.
- `features/scan` is the app's seam onto `@bnewapp/dance-flow`'s record and result
  screens. Import the flow through `@/features/scan`, not from the package directly,
  and put anything Stepz adds around the flow in that feature.
- Import shared code through public `@bnewapp/*` entry points and app-local code
  through `@/*`. Never import from `apps/mobile`.
- `features/dev-menu` is the exception to the narrow-entry rule: a debug-only surface with
  no `index.ts`, mounted by the root layout behind the Metro-safe
  `__DEV__ ? require(...) : null` shape so it never reaches a production bundle. Its
  toggles come from `@bnewapp/dance-flow/dev`; add a Stepz-only switch here, not a second
  copy of one the flow already owns.

## Configuration

- The dance flow's base URL and MMKV store id are injected once in
  `src/lib/bootstrap/dance-flow.ts`, imported for side effect by the root layout.
  The flow's store id is `edu-dance`, separate from this app's `edu` store.
- Native projects are generated and gitignored. Change `app.config.ts` or a config
  plugin, never the generated `ios/` and `android/` trees.
- The iOS deployment-target workaround is shared:
  `@bnewapp/mobile-kit/config-plugins/with-ios-min-deployment-target`. Both apps use it;
  fix it there, not per app.
- **Keep every dependency this app shares with `apps/mobile` on the identical version
  range.** `node-linker=hoisted` means a matching range resolves to one hoisted copy and
  any drift nests a second one — two copies of `react-native-reanimated` or
  `react-native-vision-camera` is a native crash, and two copies of `jotai` or
  `@tanstack/react-query` is a silently separate atom store / query cache. `expo-video`
  additionally must stay at the version named in the root `pnpm.patchedDependencies`, or
  the patch stops applying. After changing a dependency, check `corepack pnpm why <pkg>`
  reports one version and `apps/edu/node_modules` holds no nested copy.

## Design direction

The visual direction is its own, not `apps/mobile`'s. `theme/colors.js` is the single
palette source: `tailwind.config.js` builds the token values from it, and components that
need a runtime color prop read the same values through `@/lib/theme/colors`. The token
*names* come from the `@bnewapp/mobile-kit` preset — the shared packages ship `className`
strings that resolve against them, so renaming or dropping a token breaks them. Style with
`className`; never write raw hex in a component.

## Validation

Run from the repository root:

```sh
corepack pnpm --filter @bnewapp/edu typecheck
corepack pnpm --filter @bnewapp/edu test
corepack pnpm lint
```

`@bnewapp/types` resolves to source under Metro but to `dist` for `tsc`, so a fresh
clone needs `corepack pnpm build` (or `corepack pnpm exec turbo run typecheck
--filter=@bnewapp/edu`) before a bare `tsc --noEmit` succeeds.

For visible behavior changes, launch the app on a device or simulator/emulator and
verify the affected flow. Report the device and flow checked, or the reason device
verification could not run.
