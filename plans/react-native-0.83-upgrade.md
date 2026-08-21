# Upgrade `apps/mobile` to React Native 0.83 (Expo SDK 54 → 55)

**Status:** stages 0–1 and 4 done · **Date:** 2026-08-12 · **Branch:** `chore/rn-0.83`

This document records the version changes, migration pitfalls, and validation that applied to
BNewApp during the upgrade.

---

## Context

`apps/mobile` is an Expo project, and Expo pins the React Native version per SDK
release. **RN 0.83 ships in Expo SDK 55** — so "upgrade to RN 0.83" means
"upgrade Expo SDK 54 → 55", with every `expo-*` package moving in lockstep.
Bumping `react-native` alone is not possible.

### Why 0.83 and not newer

RN 0.85+ makes **Hermes V1 the default**, which carries a known Android memory
regression: ~0.5 MB of debug metadata attaches to every worklet function, and
merely importing `react-native-reanimated` raises RAM 25–30%
([RN #57059](https://github.com/react/react-native/issues/57059)). This app does
import reanimated (`src/components/bouncable-press.tsx`), so that regression
would apply.

At RN 0.83, Hermes V1 is **experimental and opt-in only** — verified below that
the generated native project contains no `hermesV1Enabled` line at all. RN 0.83
is also the first RN release with **no user-facing breaking changes**
([release post](https://reactnative.dev/blog/2025/12/10/react-native-0.83)).
The upstream Hermes V1 fix targets RN 0.87 / Expo SDK 58, so going past SDK 55 is
deferred until then.

---

## Version delta

| Package | Was | Now |
|---|---|---|
| `expo` | `54.0.36` | `55.0.28` |
| `react-native` | `0.81.5` | `0.83.10` |
| `react` / `react-dom` | `19.1.0` | `19.2.0` |
| `expo-router` | `6.0.24` | `55.0.17` |
| `expo-constants` | `18.0.13` | `55.0.17` |
| `expo-image` | `~3.0.11` | `~55.0.11` |
| `expo-status-bar` | `3.0.9` | `55.0.6` |
| `expo-linking` | *(not a direct dep)* | `~55.0.16` |
| `react-native-gesture-handler` | `~2.28.0` | `~2.30.1` |
| `react-native-reanimated` | `~4.1.7` | `~4.2.1` |
| `react-native-screens` | `~4.16.0` | `~4.23.0` |
| `react-native-worklets` | `0.5.1` | `0.7.4` |
| `@types/react` | `~19.1.0` | `~19.2.18` |
| `jest-expo` | `~54.0.17` | `~55.0.20` |
| `react-test-renderer` | `19.1.0` | `19.2.0` |
| root `engines.node` | `>=20.0.0` | `>=20.19.4` |
| root `pnpm.overrides` react/react-dom | `19.1.0` | `19.2.0` |

**Unchanged, correctly:** `react-native-mmkv@^3.3.3` (4.x needs
`react-native-nitro-modules` — a separate migration),
`react-native-safe-area-context@~5.6.0` and `@react-native-async-storage/async-storage@~2.2.0`
(SDK 55 pins the same ranges — confirmed by `expo install --check`).

**`expo-*` renumbering:** SDK 55 changed the versioning scheme so every `expo-*`
package now carries the SDK major (`expo-constants` 18.x → 55.x). This is
cosmetic, not an API change, and explains the large `package.json` diff.

---

## Breaking-change audit

Every row was checked against this codebase rather than assumed.

| Breaking change | Result here |
|---|---|
| Legacy Architecture removed; `newArchEnabled` key deleted from the config type | Key was never in `app.config.ts` — nothing to delete. Generated `android/gradle.properties` still emits `newArchEnabled=true`. |
| `android.edgeToEdgeEnabled` key removed; edge-to-edge mandatory | **Applied** — key deleted from `app.config.ts`. Generated `gradle.properties` still emits `edgeToEdgeEnabled=true`. |
| New required config plugins (`expo-image`, `expo-localization`, `expo-web-browser`) | Only `expo-image` is a dependency here. **Added** to the `plugins` array; `expo install --fix` diagnosed this itself and named the package. |
| `expo-av` removed | Not installed. |
| `removeSubscription()` → `subscription.remove()` | 0 occurrences. |
| Navigation-bar / status-bar APIs no-op'd | No `expo-navigation-bar`, no `setStatusBarStyle` calls. |
| `expo-router`: `ExpoRequest`/`ExpoResponse` removed, headless-tabs `reset` → `resetOnFocus` | Not used — the app imports only `Stack`, `Tabs`, `Redirect` and `router`. |
| `expo-blur` `experimentalBlurMethod` → `blurMethod` | Not installed. |
| `expo-video` `allowsFullscreen` → `fullscreenOptions.enable` | Not installed. No `useVideoPlayer` call sites, so the reference plan's **P6 logout crash does not apply to this app**. |
| `notification` key removed from the app.json schema | No such key. |
| `app.config.ts` now evaluated with the project's own TypeScript | Config is static and has no `node:fs` gate. `expo config --type prebuild` evaluates cleanly. |
| Min Node `^20.19.4` | Local Node v24.14.1 ✅. Root `engines.node` raised to match. |

---

## Migration pitfalls and outcomes

**P1 — root override fights React 19.2. → Applied.** The root `package.json`
`pnpm.overrides` hard-pinned `react`/`react-dom` to `19.1.0`. RN 0.83 peers
`react@^19.2.0`, so left alone the override would silently mis-resolve the whole
tree. Moved both to `19.2.0` in the same commit as the SDK bump.

**P2 — babel plugin rename. → Not applicable, verified rather than assumed.**
BNewApp's `babel.config.js` has no explicit `"react-native-reanimated/plugin"` entry or
`plugins` array and relies on
`babel-preset-expo` auto-injecting the worklets plugin. Confirmed that
`babel-preset-expo@55.0.24` still does so — `build/index.js:315` prefers
`react-native-worklets/plugin` whenever `react-native-worklets` is installed,
falling back to `react-native-reanimated/plugin` only otherwise. **No change
needed**, and the successful `expo export` (below) proves the worklet pipeline
compiles.

**P3 — `expo install --fix` does not manage everything. → Partly applied.**
`@types/react`, `jest-expo` and `react-test-renderer` were all left on 54-era
versions and bumped by hand. `babel-preset-expo` is not a direct dependency here
(it resolves transitively through `expo`, correctly at 55.0.24), so that half of
P3 did not apply.

**P4 — `--fix` downgrading `react-native-keyboard-controller`. → Not applicable.**
The package is not installed. `--fix` proposed no downgrades at all, so no
`expo.install.exclude` block was needed.

**P5 — new required config plugins. → Applied** (see the audit table).

**P6 — expo-video logout crash. → Not applicable.** `expo-video` is not
installed and there are no `useVideoPlayer` call sites.

---

## New issues, not in the reference plan

### N1 — `expo-linking` peer resolved to the SDK-54-era version

`expo-router@55.0.17` declares `expo-linking@^55.0.16` as a peer dependency.
`expo-linking` was not a direct dependency of this app, so pnpm's auto-installed
peer supplied it — and resolved **8.0.12**, the old numbering scheme, producing:

```
└─┬ expo-router 55.0.17
  └── ✕ unmet peer expo-linking@^55.0.16: found 8.0.12
```

Deep linking is what expo-router uses this for, and the app registers the
`bnewapp` scheme, so a mismatched native module here is not cosmetic. Fixed by
installing it explicitly at the SDK pin (`npx expo install expo-linking`), which
also makes it visible to autolinking in a pnpm workspace instead of relying on
hoisting.

### N2 — worklets 0.7 breaks the jest suite

Two of the four mobile test suites stopped running:

```
WorkletsError: [Worklets] Native part of Worklets doesn't seem to be initialized.
  at new NativeWorklets (react-native-worklets/src/WorkletsModule/NativeWorklets.native.ts:31:13)
  at Object.<anonymous> (react-native-worklets/src/WorkletsModule/NativeWorklets.native.ts:275:48)
  ... at react-native-reanimated/src/index.ts:5:1
  ... at src/components/bouncable-press.tsx:4:1
```

`NativeWorklets.native.ts:275` constructs the module **at import time**, and from
worklets 0.7 the constructor throws when `global.__workletsModuleProxy` is
missing — always the case under jest. Worklets 0.5.1 tolerated this, so the
suite passed before the upgrade. Every test that transitively imports
`bouncable-press.tsx` was affected.

The first attempt — `jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"))`
— **does not work**: reanimated's own mock imports the real `./index` for its
runtime values, so it re-enters the same throwing path.

The fix is to mock one level lower, in `jest.setup.js`:

```js
jest.mock("react-native-worklets", () =>
  require("react-native-worklets/lib/module/mock"),
);
```

Worklets ships its own mock, and mocking it leaves the reanimated JS layer real —
`useAnimatedStyle`, `useSharedValue` and `withSpring` still behave — rather than
stubbing out the whole animation library. All 17 mobile tests pass again.

---

## Verification performed

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 7/7 tasks |
| `pnpm lint` (biome, 86 files) | ✅ |
| `pnpm test` | ✅ 45 tests (17 mobile · 24 studio-core · 4 server) |
| `npx expo install --check` | ✅ "Dependencies are up to date" |
| `npx expo-doctor` | 18/19 — see exception below |
| `npx expo config --type prebuild` | ✅ evaluates cleanly under SDK 55's TypeScript loader |
| `pnpm mobile:prebuild:staging` (`expo prebuild --clean`) | ✅ |
| `npx expo export --platform android` | ✅ exit 0, 5 MB Hermes `.hbc` bundle |
| Generated `android/gradle.properties` | ✅ `newArchEnabled=true`, `edgeToEdgeEnabled=true`, `hermesEnabled=true`, **no `hermesV1Enabled` line anywhere** |

**Baseline before the upgrade** (captured on `master` first, so the comparison is
real): typecheck ✅, lint ✅, 45/45 tests ✅. Nothing was red going in, which is
what makes N2 identifiable as upgrade fallout rather than a pre-existing failure.

> **expo-doctor's one failure is a knowing exception.** It flags two lines, both
> in the same deliberate pnpm-workspace-isolation block in `metro.config.js`:
> `resolver.disableHierarchicalLookup: true` (expected `false`) and
> `watchFolders` not containing all of Expo's defaults. Both overrides exist to
> stop modules resolving through parent directories in the monorepo. Keep them.

The `expo export` check is worth keeping for future SDK bumps: it drives the
whole Metro + Babel pipeline over every module in `src/` without needing a
device, so it independently confirms the module graph and the worklets plugin.

---

## Out of scope

- Anything past RN 0.83 / SDK 55 — SDK 56+ waits for SDK 58's Hermes V1 fix.
- `react-native-mmkv` 4.x / `react-native-nitro-modules` migration.
- The `userInterfaceStyle: "automatic"` prebuild warning ("Install expo-system-ui
  in your project to enable this feature"). Pre-existing on SDK 54, unrelated to
  the upgrade — it needs its own decision about whether the app wants
  `expo-system-ui`.

---

## Device verification

See [`react-native-0.83-device-verification.md`](./react-native-0.83-device-verification.md)
for the on-device run: what was exercised, what broke, and how each issue was
resolved.

---

## Sources

- [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)
- [React Native 0.83 release post](https://reactnative.dev/blog/2025/12/10/react-native-0.83)
- [RN #57059 — Hermes V1 memory regression](https://github.com/react/react-native/issues/57059)
</content>
</invoke>
