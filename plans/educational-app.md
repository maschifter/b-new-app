# Educational App — Codebase & Reuse Plan

> Analysis and initialization plan for a second, simpler dance app inside this monorepo.
>
> **Scope: build the codebase, not the product.** This plan ends when `apps/edu` exists, builds,
> runs and shows a placeholder, with the shared packages extracted and the workspace green. The
> feed, scan flow and local profile — and the server endpoints and retention work they require —
> are **not phases here** and are not described here at all. They get their own plan when this one
> is done.
>
> **Self-contained on purpose.** Every product fact this plan relies on is stated inline, so no
> external document has to be opened to execute it. A product brief exists outside this repository
> and stays the requirement source for the feature work that follows; nothing here waits on it.

## Decisions locked in

| Topic | Choice | Notes |
|---|---|---|
| Plan scope | **Codebase only** — R1, R2, R3, R5a, P0, C1 | The feature phases and the server catalog surface are not in this plan. That is what removes every long-turnaround product question from the critical path |
| App name | **`Stepz`** — slug `stepz`, scheme `stepz`, bundle id / android package `com.bnewapp.stepz`. **Provisional; chosen so P0 is not blocked** | The brief gives no name; it says only "a design style similar to Boogiz", which names a reference product, not this app — do not adopt `Boogiz` as the identity. Workspace package stays `@bnewapp/edu` at `apps/edu`: it is internal, never user-facing, and costs nothing to keep when the display name changes. **Re-decide before P0 runs, not after** — the display name, slug and scheme are cheap to change afterwards, but an iOS bundle identifier changed after the first build costs a provisioning-profile round trip |
| App placement | New Expo app `apps/edu` (`@bnewapp/edu`) in this monorepo | Per the brief. Not a build flavor of `apps/mobile`: different navigation, different design direction (Boogiz), different persistence model |
| Identity | **Supabase anonymous auth** (`signInAnonymously` on first launch) | "No user IDs" is honored as a UX property: no sign-up, no login, no profile sync. The device still gets an anonymous JWT, so the existing owner-scoped dance API, storage layout and scan queue are reused unchanged |
| Reuse strategy | **Extract shared packages first**, then init the app | `apps/mobile` keeps working throughout; one record-flow codebase, not two |
| Catalog | **Shared `dance_moves` / `dance_genres` / `music_tracks`** | Managed by the existing admin panel for both apps. `level` and genre columns already exist |
| Profile data | 100% local (MMKV), never synced | Learned moves, saved scores and personal recordings never leave the device |
| Analytics | None | The scan and profile flows each define events; the brief explicitly drops them for this app |
| Shared RN package API surface | Expose **source**, not `dist` | See R1: `exports.types` → `src/index.ts`, no `build` script |
| API base URL injection | One-time `configure…()` at app bootstrap, read lazily per call | See R2: a factory would change every `api.ts` import site and its tests |
| R1 migration style | **Re-export shims at the old `@/` paths**, not an app-wide find-and-replace | The moved modules have ~88 import sites across `apps/mobile`. Shims keep **every call site unchanged**, which is what makes the bail-out real, and let `@/lib/theme/colors` keep working for the screens that stay. The commit itself is ~40 files (the moves, the shims, the package scaffolding) — the value is zero consumer edits, not a small diff |
| API URL resolution | The RN-coupled resolver moves to `mobile-kit` too; each app calls it once with its own env/port | Leaving only the pure `resolveApiUrl` in the package would copy ~25 lines of `expo-constants` hostUri + `expo-device` logic into `apps/edu`. See R1 |

### Nothing external blocks the start

Earlier drafts put three product and data decisions on the critical path — style cardinality, feed
ordering and the personal-recording source. All three belong to the server catalog surface and to
the scan flow's retention work, neither of which is in this plan, so **none of them blocks R1**.
The app name blocked P0 too; it is now decided provisionally in the table above.

What remains open is settled **inside** the phases, by running things rather than by asking anyone
— the tsconfig strictness base, the NativeWind transform's reach into `packages/`, and whether
`jest-expo` runs inside a package. R1's day-one checklist exists to answer all three cheaply and
early, and the third is the bail-out trigger. See "Open decisions" at the end for the full list and
where each is settled.

## Current state (starting point)

- `packages/dance-core` — pure domain: `FilmStep`, countdown/timing, scoring, scan-status
  coercion. **Reusable as-is, no change needed.**
- `packages/types` — shared DTOs incl. `DanceMove`, `DancePost`, `ScanStatus`. Reusable.
- `apps/server/src/modules/dance/` — routes, service, scan worker, media worker, scanning
  client. Every route is `preHandler: app.authenticate` and scoped by `request.user.sub`.
- `apps/mobile/src/features/dance/` — the valuable part: `ui/record-dance-screen.tsx` (camera,
  PiP, countdown, music sync, recorder adapter), `ui/dance-result-screen.tsx`,
  `ui/submission-state.ts`, `score-polling.ts`, `recording-adapter.ts`, and the `_atoms/` split.
- `packages/*` are all **pure, RN-free**. There is no React Native-capable shared package, and
  no package in this repo has ever emitted declarations for `.tsx` — see R1.
- `packages/AGENTS.md` is out of date: it documents a `utils` package that no longer exists as a
  package — `packages/utils/` has no `package.json`, only `.turbo/` and `tsconfig.tsbuildinfo`, so
  it is not in the workspace at all — and it does not mention `dance-core`. R1 deletes the dead
  directory and fixes the document alongside the RN exception.
- The dance feature depends on app-local modules (measured, not guessed):

  | Imported from `apps/mobile` | In the dance feature | App-wide (incl. tests) |
  |---|---|---|
  | `@/components/bouncable-press` | 9 sites | 22 |
  | `@/test-utils/render-with-providers` | 6 | 14 |
  | `@/lib/media/use-focused-playback` | 5 | 5 |
  | `@/lib/theme/colors` | 4 | 15 |
  | `@/components/error-boundary` | 4 | 9 |
  | `@/lib/auth/query-auth-atom` | 3 | 8 |
  | `@/lib/media/use-synced-music-track` | 2 | 2 |
  | `@/lib/jotai/authed-query` | 2 | 6 |
  | `@/lib/jotai/atom-with-mmkv` | 1 | 3 |
  | `@/lib/api/client` | 1 | 5 |
  | `@/components/app-header` | 1 | 3 |

  **The app-wide column is why R1 uses re-export shims.** The dance feature's 38 sites are only a
  fraction of the ~88 import sites these modules have across `apps/mobile`; a straight
  find-and-replace would make R1 an app-wide diff and destroy the bail-out. See R1.

  Two of these do **not** follow the flow out of the app: all four `@/lib/theme/colors` importers
  and the single `@/components/app-header` importer are screens that stay in `apps/mobile`. The
  moving files consume theme tokens only through NativeWind `className` (`bg-app`, `bg-panel`,
  `bg-panel-raised`, `text-neon`, `text-foreground`, `border-border`), which is why the shared
  **tailwind preset** — not the import count — is what forces `colors.js` into the package.

## Why a refactor is required before writing the new app

Root `AGENTS.md`: *"Apps may depend on packages. Packages must never import from apps."*
`apps/edu` therefore cannot import `apps/mobile/src/features/dance`, and no existing package can
hold React Native code. Without the extraction below, the only option is copy-paste, which forks
the record flow permanently.

### Conflicts between the brief and the current system

Background, not a work list. **Only conflicts 1 and 2 shape this plan** — 1 is why R5a exists, and
2 is why the scaffold must keep "temporary scan upload" and "personal recording" apart from the
start. Conflicts 3–5 are recorded so they are not rediscovered; resolving them is
feature work, not this plan's.

1. **"No user IDs" vs. the owner-scoped data model.** `dance_posts.owner_id → auth.users`,
   `dance_scans.owner_id`, storage keys `{ownerId}/{postId}.mp4` (`media-paths.ts`). Anonymous
   auth resolves this without schema churn — see R5a for the blockers it hits.
2. **"Videos are not uploaded to the cloud" vs. how scanning works.** `scan-worker.ts` signs the
   raw owner-scoped `video_path` for five minutes and `scanning-client.ts` posts `expert_url` +
   `amateur_url` to the pose-compare servers, so the attempt clip *must* reach Supabase Storage.
   Two distinct concepts must stay apart in code and in the privacy copy:
   - **Temporary scan upload** — required, cloud, deleted once the score is terminal.
   - **Personal recording** — optional, device-only, never uploaded.

   Deferred to the feature work: the media worker also *derives* a music-merged video and a poster
   server-side. If the saved personal recording is meant to have music, `apps/edu` must download
   that derived artifact before deleting the post; otherwise the device-only copy is the silent
   raw clip. Nothing in this plan forces the choice, but the scaffold must not foreclose it.
3. **Missing catalog surface for the feed and the profile**: `DanceMovesQuery` is `genre_id` + `cursor` +
   `limit` only — no `level` filter, no batch move lookup by id, no catalog/style totals endpoint,
   and no likes table or endpoint anywhere in the schema.
4. **No tempo component exists.** The brief's feed flow says "use the existing tempo component"; the repo
   only has a local `PlaybackRateBar` function inside `learn-dance-screen.tsx` (discrete
   0.5/0.75/1/1.25/1.5 chips). The vertical continuous drag bar — and its gesture arbitration
   against the feed's vertical swipe — is new work owned by `apps/edu`.
5. **Style cardinality disagrees with the schema.** `dance_move_genres` is a many-to-many join
   table; the profile flow's `Move` model has a single `styleId` and groups each move into
   one style section. Not resolved here — it is a catalog/schema decision, and feature work.

## Target architecture

```
apps/
  edu/          NEW   Expo app: TikTok feed + scan flow + local profile
  mobile/       b-new-app (unchanged behavior)
  server/       shared; additive endpoints only
  admin/        unchanged; manages the catalog for both apps
packages/
  dance-core/   pure     reused as-is
  types/        pure     reused; gains a few DTOs
  mobile-kit/   NEW RN   shared RN primitives + transport + theme preset + test utils
  dance-flow/   NEW RN   the record → upload → score flow, app-agnostic
```

`mobile-kit` and `dance-flow` are a deliberate exception to *"keep shared packages
platform-neutral"*; their package purpose must state it, and `packages/AGENTS.md` must record the
exception so the rule is not silently broken.

### What moves, what stays

**`packages/mobile-kit`** (from `apps/mobile`):

| Source | Destination |
|---|---|
| `src/components/bouncable-press.tsx` | `src/ui/bouncable-press.tsx` |
| `src/components/error-boundary/*` | `src/ui/error-boundary/*` |
| `src/features/dance/ui/dance-skeleton.tsx` | `src/ui/dance-skeleton.tsx` — see the note under the `dance-flow` list |
| `src/lib/api/client.ts`, `api-url.ts` | `src/api/*` |
| `src/lib/auth/query-auth-atom.ts` | `src/auth/query-auth-atom.ts` |
| `src/lib/jotai/authed-query.ts`, `atom-with-mmkv.ts` | `src/jotai/*` |
| `src/lib/react-query/query-error-reset.ts` | `src/react-query/*` |
| `src/lib/providers/query-provider.tsx` | `src/react-query/query-provider.tsx` |
| `src/lib/media/use-focused-playback.ts`, `use-synced-music-track.ts` | `src/media/*` |
| `src/lib/theme/colors.js` + `colors.d.ts` | `theme/colors.js` + `theme/tailwind-preset.js` |
| `src/test-utils/render-with-providers.tsx` | `src/testing/render-with-providers.tsx`, behind a separate `./testing` export |
| `jest.setup.js` (worklets + async-storage mocks), `jest.after-env.js` (MMKV reset), `jest.style-mock.js`, `__mocks__/react-native-mmkv.js`, and `jest.config.js`'s `transformIgnorePatterns` | `testing/jest/{setup,after-env,style-mock}.js`, `testing/jest/mocks/react-native-mmkv.js`, `testing/jest/preset.js` — see the jest-harness note below |

Every source path above keeps a **thin re-export shim** at its old `@/` location for the duration
of R1 (`src/lib/theme/colors.js` re-exports the package's `colors.js`, `src/components/bouncable-press.tsx`
re-exports `@bnewapp/mobile-kit`, and so on). That is what keeps R1 a ~10-file diff instead of an
88-site rewrite, and what keeps `@/lib/theme/colors` valid for the four staying screens. The shims
are deleted in a dedicated cleanup commit after `apps/edu` exists (phase C1), not inside R1.

`render-with-providers` is in the list because it has 6 call sites inside the dance feature and is
already app-agnostic — it seeds `queryClientAtom` and `queryAuthAtom`, the same seam the flow
depends on. If it does not move, the flow's component tests cannot move either (see R1).

`query-provider.tsx` moves with it, because it is the production-side half of that same seam.
CLAUDE.md §6 singles this file out — *"hydrate that exact stable client into `queryClientAtom`;
never let the two APIs create separate caches"* — and it is 18 app-agnostic lines. Moving the test
mirror but not the real provider would leave `apps/edu` hand-copying the one file whose subtle
correctness the conventions explicitly warn about. If it stays per-app instead, that must be a
recorded decision rather than an omission.

**The jest harness is shared infrastructure, in both branches of the bail-out.** The dance
component tests do not run on `jest.config.js` alone: they need the `react-native-worklets` mock
and the async-storage mock from `jest.setup.js`, the MMKV wipe in `jest.after-env.js`, the
`\\.css$` → `jest.style-mock.js` mapping, and the manual `__mocks__/react-native-mmkv.js`. This
matters even if the flow's own tests stay in `apps/mobile` — `apps/edu` renders `dance-flow`
screens in its later feature tests and needs the identical harness. Publish it from `mobile-kit`'s
`./testing` export so both apps' `jest.config.js` point `setupFiles` / `setupFilesAfterEnv` at one
copy; duplicating it into `apps/edu` is the fallback, and must be a stated decision rather than a
default.

Four parts of that harness need naming, because "publish it from `./testing`" does not cover them:

- **`transformIgnorePatterns` is harness, not config.** `apps/mobile/jest.config.js` extends
  jest-expo's default allowlist with `jotai-tanstack-query`, whose published entry is ESM reached
  through a top-level symlink, so the preset's `.pnpm` allowance does not cover it. (That
  rationale is the config's own comment; under `node-linker=hoisted` there is no meaningful `.pnpm`
  tree at all, which makes the explicit entry more necessary, not less.) `apps/edu`
  renders `dance-flow` screens that import it. Omitting that entry fails with an ESM parse error
  that looks nothing like its cause, so ship a **jest preset / config fragment** from `./testing`,
  not only the setup files.
- **`preset` is singular, so the shared piece cannot itself be a jest preset used alongside
  `jest-expo`.** Both apps need `preset: "jest-expo"`. The shared export is therefore either a
  spreadable config object each app merges beside that preset, or a preset module that re-exports
  jest-expo's own and adds to it. Pick one in R1; "ship a preset" left unqualified produces the
  configuration that cannot exist.
- **A config fragment living in a package cannot use `<rootDir>`.** `apps/mobile` spells all four
  of its entries — `setupFiles`, `setupFilesAfterEnv`, the `\\.css$` mapping and the
  `@bnewapp/studio-core` mapping — as `<rootDir>/…` today, and `<rootDir>` resolves to the
  *consuming app*, not the package. Every path the shared fragment contributes must be a
  `require.resolve("@bnewapp/mobile-kit/testing/…")` instead. This is a rewrite of those entries
  during the move, not a copy, and getting it wrong resolves to a path inside `apps/edu` that does
  not exist.
- **`__mocks__/react-native-mmkv.js` cannot be *resolved* from the package.** Jest auto-applies a
  manual mock for a `node_modules` module only when the file sits at
  `<rootDir>/__mocks__/<module>.js` — the mock's own header says exactly that. Both apps therefore
  keep a physical file at that path. The package owns the implementation; each app's file is a
  one-line re-export. `apps/mobile` keeps its own file in R1: the move table row means the body
  moves, not the hook.

`session-provider.tsx` **stays per-app**: `apps/mobile` signs in with PKCE, `apps/edu` calls
`signInAnonymously`. Both write the same `queryAuthAtom` projection — that is the seam that makes
the shared flow identity-agnostic.

**`packages/dance-flow`** (from `apps/mobile/src/features/dance`):
`api.ts`, `config.ts`, `recording-adapter.ts`, `score-polling.ts`, `dev.ts`, and
`ui/{record-dance-screen,dance-result-screen,camera-permission-overlay,submission-feedback,submission-state}`.
(`config.ts` is R2's output — the injected `apiUrl`/`mmkvId` and `persistedDanceAtom`. It moves with
the flow; only `apps/mobile/src/lib/bootstrap/dance-flow.ts`, which calls it, stays behind.)

The `_atoms/` files move **by export, not by file** — see R3; the flow/product seam runs through
the middle of every one of them.

**`dance-skeleton.tsx` is deliberately not in that list — it belongs in `mobile-kit`.** It has
three consumers and **two of them stay**: `choose-dance-moves-screen.tsx:22` and
`learn-dance-screen.tsx:21` both `import { DanceSkeleton } from "./dance-skeleton"`, alongside
`record-dance-screen.tsx:36`. Putting a generic loading skeleton inside a package whose stated
purpose is "the record → upload → score flow", so that two b-new-app catalog screens have to reach
into it, is the same mismatch R3 refuses for the catalog list atoms. Move it to
`mobile-kit/src/ui/` in R1 with the other shared primitives; if its markup turns out to be
dance-specific enough that a shared home is wrong, record that and leave it in `apps/mobile`, but
do not park it in `dance-flow`.

**It is the one moved module that gets no shim, and that is deliberate.** Every other R1 move
vacates a `@/` path that a one-line re-export can hold; `dance-skeleton` is reached relatively
(`./dance-skeleton`), so a shim would mean leaving a stub file inside the feature folder it is
being taken out of. Three import sites is cheaper than that — edit
`choose-dance-moves-screen.tsx:22`, `learn-dance-screen.tsx:21` and `record-dance-screen.tsx:36`
to `@bnewapp/mobile-kit` in R1. This is the sole exception to "zero consumer files change"; note
it when sizing the commit.

If instead it is left in `apps/mobile`, nothing changes in R1 and R3 must not move it either —
the two staying importers are the reason. What is not available is moving it into `dance-flow`.

**Stays in `apps/mobile`** (b-new-app product surface, not shared):
`ui/choose-dance-moves-screen.tsx`, `ui/dance-move-card.tsx`, `ui/learn-dance-screen.tsx`,
`ui/dance-post-grid.tsx`, `ui/dance-post-detail-screen.tsx`, `ui/dance-post-menu.tsx`.

### Four package mechanics that must be solved in R1

**First, a framing correction that changes how much these are worth worrying about: `.npmrc` sets
`node-linker=hoisted`, so every dependency is flat at the workspace root.** That makes each
peer-dependency list in this plan **documentation, not enforcement** — a missing or wrong peer entry
still resolves at runtime, under `tsc --noEmit` and under jest, and no check here will ever fail on
it. It cuts both ways. It is why the undeclared `@react-navigation/native` in R1's moving set (see
R1's peer-dependency note) would never have surfaced on its own, and it is also why the resolution
anxieties in mechanic 4 and risk 2 below are less likely to bite than they read. Spend R1's budget
on the strictness, transform-scope and jest-harness questions instead.

- **Compiler strictness differs between the source and the destination — settle this first.**
  Every package extends `tsconfig.base.json`, which sets `exactOptionalPropertyTypes: true`;
  `apps/mobile/tsconfig.json` extends `expo/tsconfig.base` and **never inherits it** (it sets only
  `strict` and `noUncheckedIndexedAccess`). So the ~15 moving files meet
  `exactOptionalPropertyTypes` for the first time the moment they land in a package, and the
  errors appear on day one of R1 — before any of the mechanics below are reached.
  **Decide explicitly:** either the RN packages extend `expo/tsconfig.base` and are the only
  packages in the repo outside `tsconfig.base.json`'s strictness, or they inherit it and the
  moving files are fixed as part of R1. Do not let the choice fall out of whichever `extends`
  line gets typed first.
- **TypeScript for a package that contains `.tsx`.** There is no precedent in this repo.
  `turbo.json` makes `typecheck` and `test` depend on `^build`, and every existing package builds
  `src/**/*.ts` only, to `dist` (`dance-core` and `studio-core` additionally with
  `moduleResolution: NodeNext` + `rewriteRelativeImportExtensions`; `types` with neither). An RN
  package additionally needs `.tsx` in `include`, React and React Native types
  (`apps/mobile/tsconfig.json` extends `expo/tsconfig.base`; the root `tsconfig.base.json` does
  not), and **its own** `/// <reference types="nativewind/types" />` —
  without that reference, `className` on a `View` does not typecheck outside `apps/mobile`.
  **Decision:** `mobile-kit` and `dance-flow` point every `exports` condition
  (`react-native`, `types`, `default`) at `./src/index.ts` and ship **no `build` script**. Metro
  already consumes source through the `react-native` condition, and emitting declarations for TSX
  buys nothing here.

  **Dropping `build` does not mean dropping `typecheck` and `test` — decide those separately.**
  Turbo fans a task out to whichever packages declare that script, so a package with no
  `typecheck` script is silently absent from `corepack pnpm typecheck`; `types`, `studio-core` and
  `dance-core` all declare one, and the latter two declare `test`. If the RN packages omit
  `typecheck`, their sources are only ever checked transitively through `apps/mobile`'s *looser*
  tsconfig — which is exactly the strictness gap mechanic 1 exists to close, and it would make R1's
  acceptance criterion read green while risk 2 is still unanswered. **Both packages declare
  `typecheck: "tsc --noEmit"`**, and declare `test` if their suites live in the package (which is
  what risk 4 settles). Verify after scaffolding that `corepack pnpm typecheck` actually names them
  in its output.

  **Declaring `test` in an RN package means a second test runner under one turbo task, and its own
  babel config — neither is implied by "declare `test`".** `types`, `dance-core` and `studio-core`
  all run `vitest run`; an RN package cannot, because the suites render React Native components.
  So `mobile-kit` (and `dance-flow` in R3) needs `test: "jest"` plus `jest`, `jest-expo` and
  `babel-preset-expo` as its own devDependencies, **and a `babel.config.js` inside the package**
  with `["babel-preset-expo", { jsxImportSource: "nativewind" }]` — babel-jest resolves the
  config from the file's own package root, not from `apps/mobile`. After that, `corepack pnpm test`
  fans out to two different runners under the same task name, which is fine but should be a stated
  choice. This is the concrete shape of risk 4: if any of it cannot be made to work, that is the
  bail-out trigger, not a configuration detail to keep grinding on.

  **Spell out the `exports` subpaths, because an `exports` map is a closed door.** The move table
  names destination *files*, but only what `exports` lists is importable, and `mobile-kit` needs
  more than `"."`: `./testing` (the RTL-dependent test utilities, deliberately separate from the
  main entry) and the theme entries. The theme ones have an extra constraint — a
  `tailwind.config.js` reaches them through **CJS `require` at config load**, not through Metro, so
  `./theme/colors` and `./theme/tailwind-preset` must resolve as plain CJS `.js`, outside the
  source-only TS entry. `apps/mobile/tailwind.config.js` does
  `require("./src/lib/theme/colors")` today; in R1 it switches to the package preset, which means
  the preset must be requireable before the config can load at all. Get this list right in the
  package scaffolding — a missing subpath fails at Metro/tailwind startup with a resolution error,
  not at typecheck.
- **NativeWind across a package boundary.** Classes like `bg-app` / `text-foreground` only
  resolve if both apps share the token set *and* each app's `tailwind.config.js` `content` glob
  includes `../../packages/*/src/**/*.{ts,tsx}`. Hence the shared tailwind preset in
  `mobile-kit/theme`; neither app redefines `COLORS`. `apps/edu`'s Boogiz palette overrides the
  preset's token **values**; the token **names** must stay identical or the moved screens lose
  their styling. **The preset therefore becomes a shared contract:** once `mobile-kit` ships
  `className` strings, a token added to `apps/mobile`'s palette but not to the preset silently
  breaks styling in `apps/edu`, and the reverse. Same invisible-failure class as the content glob
  below — token changes go in the preset, never in one app's config.

  **This includes `apps/mobile`, and it is R1's only CI-invisible failure.** Its
  `tailwind.config.js` is `content: ["./src/**/*.{js,jsx,ts,tsx}"]` today. The moment a moved file
  lives under `packages/`, its `className` strings fall outside the scan and its styles silently
  vanish — with `typecheck`, `test` and `lint` all still green. Widening that glob is a mandatory
  R1 step, not an `apps/edu` concern.

  **There is a third NativeWind mechanism, and it is not the glob.** `className` becomes `style`
  through a *babel transform* — `babel-preset-expo` with `{ jsxImportSource: "nativewind" }`,
  which lives in `apps/mobile/babel.config.js` — and that is independent of both the tailwind
  content scan and typechecking. A class string in a package file can typecheck (risk 2) **and** be picked
  up by a widened glob **and** still not compile, if the transform does not reach files under
  `packages/`; `className` then arrives as an inert string prop and the styles vanish. Same
  invisible-failure class, different cause, so it needs its own day-one check: render one moved
  component with a `className` on a device and confirm the style applies. `apps/edu`'s
  `babel.config.js` (see P0) is necessary but not sufficient — the question is transform *scope*,
  not transform presence.

  **Size it honestly, so it is not dismissed later — and note `bouncable-press.tsx` is in scope.**
  It carries no Tailwind class *literals*: it takes `Omit<PressableProps, "style">` and styles
  through a reanimated `style`, so the class strings its callers pass live at call sites that stay
  inside the glob. But it declares `className?: string` (`bouncable-press.tsx:7`) and puts it on a
  JSX element (`className={className}`, `bouncable-press.tsx:41`), so it depends on the transform
  above — and if that fails, all **22** `BouncablePress` call sites lose their styling at once.
  The glob's only R1 casualty is the error boundary's five class strings; the *transform*'s R1
  casualty is every `BouncablePress` in the app. This is why the device check in the acceptance
  criteria is load-bearing and not a formality. The remaining glob exposure arrives in **R3**, when
  the record and result screens move, which is precisely why the glob is widened in R1 rather than
  discovered there.
- **Jest resolution — verify, do not assume.** `apps/mobile/jest.config.js` maps only
  `@bnewapp/studio-core`, yet `@bnewapp/dance-core` already resolves without a mapper via the
  `"react-native"` export condition. Check whether a `moduleNameMapper` entry is needed at all
  before adding one.

## Phases

Execution order R0 → R1 → R2 → R3 → P0, with **R5a landable any time before P0** (it is
database-only and independent of R1–R3) and **C1 any time after P0**. One commit per phase.

**Device verification is a prerequisite of the programme, not a per-phase formality — settle who
runs it before R1 starts.** Three acceptance criteria here can only be closed on hardware: R1's
day-one item 3 (the NativeWind transform's reach into `packages/`), R3's end-to-end record →
upload → score run, and P0's build. They are the only checks that catch the failures CI cannot
see, so an unowned device check silently converts them into unverified assumptions.

- **Android alone closes R1 and R3.** Both ask about the babel transform and the camera/upload
  path, neither of which is iOS-specific. Any machine that can run `corepack pnpm mobile:android`
  is enough, and the repo's Android project is generated (`.gitignore:8` ignores
  `apps/mobile/android/`), so this is a prebuild away.
- **P0's iOS half needs a Mac, and it is the half that hides a known blocker.**
  `apps/mobile/plugins/with-ios-min-deployment-target.js` exists because expo-router 55's pod
  cannot compile below iOS 16; `apps/edu` hits it identically, and it surfaces only at an iOS
  prebuild + build. If no Mac is available when P0 lands, **split the acceptance** — "Android
  verified, iOS deferred with the deployment-target plugin copied but unexercised" — and record
  the iOS build as outstanding work rather than reading P0 green. Do not drop the criterion.

| Phase | Status | Summary |
|---|---|---|
| R0 — Decisions | ✅ Done | Recorded in "Decisions locked in" above |
| R1 — `packages/mobile-kit` | ✅ Done | Extract RN primitives + transport + theme preset + test harness behind re-export shims; widen the tailwind glob; settle the RN-package mechanics. See "R1 outcome" below |
| R2 — De-app-ify the dance feature | ✅ Done | Inject the API base URL and MMKV namespace instead of importing app-local config. See "R2 outcome" below |
| R3 — `packages/dance-flow` | ✅ Done | Extract the record/result flow by export; `apps/mobile` consumes it. See "R3 outcome" below |
| R5a — Anonymous identity | ✅ Done (staging) | Signup-trigger migration + conversion branch + corrected invariant, pushed to `bnewapp(staging)` and proven against it: identified signup, anonymous sign-in, conversion, and an anonymous token reaching an owner-scoped dance endpoint. **Production push still outstanding.** See "R5a outcome" below |
| P0 — Init `apps/edu` | ☐ | Scaffolding only, no feature code |
| C1 — Delete the R1 shims | ☐ | Rewrite the ~88 `@/` import sites in `apps/mobile` to `@bnewapp/mobile-kit` and delete every shim **except `lib/api/client`, which graduates rather than disappears** — see R1's *"Consequence for the shim"* note. Unblocked once `apps/edu` exists (P0). The largest single diff in the programme, and **not optional**: leaving the shims permanently means both apps reach shared code through `apps/mobile`'s `@/` paths, which is the boundary violation this refactor exists to remove |

**Where the phases stop.** P0's acceptance — `apps/edu` builds, runs and shows a placeholder, with
the workspace green — is the end of this plan. The feed, the scan flow and the local profile, plus
the server catalog endpoints (`level` filter, batch move lookup, catalog totals, feed ordering) and
the temporary-clip retention and abuse work they need, are feature work. Do not start them from
here; plan them separately once P0 lands.

### Bail-out condition (decide before R1 starts)

R2 and R3 are unwindable only at increasing cost, so the fallback is fixed in advance. If R1 shows
that an RN package cannot be typechecked and tested cleanly in this monorepo — the source-only
`exports` map fails downstream `tsc --noEmit`, `className` cannot be typechecked inside a package,
or `jest-expo` cannot run inside a package so the flow's component tests cannot follow the code
out — then:

1. `mobile-kit` still ships, but **without** the `./testing` export; RN component tests stay in
   `apps/mobile` and exercise the package from there. Note this does *not* dispose of the shared
   jest harness question — `apps/edu` still needs the worklets, async-storage and MMKV mocks to
   render `dance-flow` screens, so in this branch they are duplicated into `apps/edu` as a
   recorded decision.
2. If the failure is NativeWind rather than jest — `className` does not typecheck across the
   package boundary even with the package's own `nativewind-env.d.ts` — `mobile-kit` still ships,
   but its shared components style with `StyleSheet` and the tailwind preset serves the apps only.
   This is a larger edit than either neighbouring branch: it rewrites the moved components'
   styling and forfeits the shared token contract. It also puts the shared components off-standard
   — CLAUDE.md §7 mandates `className` for static styling — so this branch must record the
   exception in `packages/AGENTS.md` rather than leave the packages quietly non-conforming. Take it
   deliberately, not as a silent fallback.
3. If even that fails, stop at R1. `dance-flow` is not attempted; `apps/edu` is deferred and the
   decision (copy vs. wait) is escalated rather than taken inside R3.

---

### R1 — `packages/mobile-kit`

A file move behind re-export shims, *plus* the first RN package in this repo. No behavior change.

**Day-one checklist.** The four items that decide whether R1 is viable, in order, each cheap and
each answered before the bulk of the move is worth doing. The reasoning behind them is in the
package-mechanics and NativeWind sections above; this is the working list.

1. **Settle the tsconfig base** and typecheck the ~15 moving files against it. `exactOptionalPropertyTypes`
   bites here or nowhere. (Mechanic 1.)
2. **Widen `apps/mobile/tailwind.config.js`'s `content` glob** to `../../packages/*/src/**/*.{ts,tsx}`.
   Mandatory; no check catches its absence.
3. **Device-check one moved `className` component** — the babel transform's reach into `packages/`
   is a separate mechanism from both the glob and typechecking, and a failure costs all 22
   `BouncablePress` call sites at once.
4. **Run one moved component suite from inside the package**, with the harness resolved through
   `./testing`. This is the bail-out trigger; answer it on the media hooks before R3 moves the
   screens.

**Migration style: shims, not a rewrite.** The moved modules have ~88 import sites across
`apps/mobile` (see the table in "Current state"), so R1 does **not** update call sites. Each
vacated `@/` path becomes a one-line re-export of `@bnewapp/mobile-kit` — with one exception, the
`api/client` shim below, which has behavior. Call sites migrate in **phase C1**, once `apps/edu`
exists.

**Size the commit honestly.** It is ~43 files: ~17 moved modules, ~14 shim paths, the package
scaffolding (`package.json`, tsconfig, `index.ts`, `nativewind-env.d.ts`, the `./testing` entry),
`tailwind.config.js` and `packages/AGENTS.md`. What makes it revertible is that **consumer files
change in exactly one place** — the three `./dance-skeleton` importers, which cannot be shimmed —
not that the diff is small. `@/lib/theme/colors` keeps working for the four staying screens
throughout.

Three real design changes:

- `api/client.ts` currently resolves `apiUrl` at module load from
  `process.env.EXPO_PUBLIC_API_URL` and `expo-constants`. `api-url.ts` already exports a **pure**
  `resolveApiUrl`, so most of the split is in place. **Move the RN-coupled wrapper into the
  package as well** — the `Constants.expoConfig.hostUri` / `expoGoConfig.debuggerHost` parsing,
  `Device.isDevice` and `Platform.OS` (~25 lines in `client.ts`) — exposed as a single call each
  app makes once with its own env value and port. Exporting only the pure `resolveApiUrl` would
  copy that block verbatim into `apps/edu`. Each app still owns its resulting `apiUrl` constant,
  which is the input R2 needs.

  **Consequence for the shim:** `apiUrl` is a module-level const resolved at import
  (`client.ts:29`), and five app sites import it from `@/lib/api/client`. That shim therefore
  cannot be a re-export — it must call the package resolver with the app's own env value and port
  and re-export the resulting const. It is the only shim in R1 that contains logic.

  **And therefore the only one C1 cannot delete.** Every other vacated `@/` path is a pure
  re-export that disappears once its call sites point at `@bnewapp/mobile-kit`, but `apps/mobile`
  still has to own its `apiUrl` — the package exposes a resolver, not a value. In C1 this shim
  **graduates into a real app-owned module** (for example `src/lib/api/api-url-config.ts`) that
  calls the resolver once and exports the const; the five sites are repointed at it, not at the
  package. `apps/edu` gets the mirror-image module of its own. Writing *"delete every shim"* without
  this exception would drop the app's base-URL resolution on the floor.
- `mobile-kit`'s **peer dependencies**, which the move table does not spell out:
  `react`, `react-native`, `react-native-reanimated` + `react-native-worklets`
  (`bouncable-press.tsx` uses `useAnimatedStyle` / `withSpring`), `react-native-mmkv`, `jotai`,
  `jotai-tanstack-query`, `@tanstack/react-query`, `expo-constants`, `expo-device`,
  `expo-audio`, `@react-navigation/native`, `nativewind`, plus `@testing-library/react-native`
  scoped to the `./testing` export. `dance-flow` inherits the reanimated/worklets requirement
  transitively through `BouncablePress`, which is why R3 lists them as well even though no
  `dance-flow` file imports them directly.

  **`@react-navigation/native` is the one entry on that list that is not a formality.**
  `use-focused-playback.ts:1` imports `useIsFocused` from it, and the package is declared **nowhere
  in this repo** — it is not in `apps/mobile/package.json`; it exists only at the hoisted workspace
  root, pulled in transitively by `expo-router`. Under `node-linker=hoisted` it resolves anyway, so
  nothing fails when it is omitted, which is exactly why it has to be written down. Record it as a
  pre-existing hole in `apps/mobile` as well. It is also the module R1's day-one item 4 uses as the
  bail-out experiment, so it is the first moved file whose dependency list has to be right.

  **`expo-video` is deliberately not on that list.** No file moving to `mobile-kit` imports it —
  `use-synced-music-track.ts:35` types the player structurally and says so in its own comment. It
  belongs to `dance-flow`'s peers only, where R3 already has it.
- The RN-package mechanics listed above (source-only `exports`, no `build` script, own
  `nativewind-env.d.ts`, and the tsconfig base settled by mechanic 1 rather than assumed).

Also in this phase:

- **Widen `apps/mobile/tailwind.config.js`'s `content` glob** to cover
  `../../packages/*/src/**/*.{ts,tsx}`. Mandatory, and the one R1 regression no check catches — see
  the NativeWind note above.
- Update `packages/AGENTS.md` on **four** counts, not three: record the RN exception, drop the
  stale `utils` entry, add `dance-core`, and fix the **"Public API and Builds"** section — it
  currently says to *build* an edited package before typechecking downstream consumers and to
  "preserve ESM/import-extension conventions already used by the package", which is exactly the
  convention the source-only, no-`build`-script decision breaks. Leaving it means the document
  contradicts the two newest packages.
- Delete `packages/utils/` itself — it is a leftover build-artifact directory with no
  `package.json`, not a package.

The tests sitting beside the moved modules are R1's real experiment, not a detail. **Four
suites move, not three:**

| Suite | Follows |
|---|---|
| `lib/media/__tests__/use-focused-playback.test.tsx` | `use-focused-playback.ts` |
| `lib/media/__tests__/use-synced-music-track.test.tsx` | `use-synced-music-track.ts` |
| `lib/api/__tests__/api-url.test.ts` | `api-url.ts` |
| `lib/providers/__tests__/query-provider.test.tsx` | `query-provider.tsx` |

`lib/auth/__tests__/session-provider.test.tsx` **stays** (`session-provider.tsx` is app-owned).

**`query-provider.test.tsx` is the one that matters most, and it is the one easiest to miss.** It
is the only suite that asserts the CLAUDE.md §6 contract this phase moves — that React Query
hooks and jotai query atoms resolve the *same* `QueryClient` — and unlike `api-url.test.ts` it
renders a component, so it exercises the same jest-inside-a-package question as the media hooks. Those four
moving suites are what answer risk 4 below.

**`client.ts` has no test today** — `lib/api/__tests__/` contains only `api-url.test.ts`, which
covers the pure resolver. The untested part is exactly the RN-coupled block this phase promotes to
shared infrastructure (`expoConfig.hostUri` / `expoGoConfig.debuggerHost` parsing, `Device.isDevice`,
the Android localhost rewrite), and it is about to gain a second consumer with a different env and
port. **Write that test in R1**; it is new coverage, not a suite that follows the code.

**One of the two `api-url.ts` guards is live; only the other is unwired.** Keep them apart —
they look alike and are not.

- `requirePublishedApiUrl` (`api-url.ts:21`) **is called by `resolveApiUrl` itself**
  (`api-url.ts:63`, the `!isDevelopment` branch), so it runs on every launch of a released build
  and is the only thing enforcing an HTTPS `EXPO_PUBLIC_API_URL` there. It is live shared
  infrastructure about to gain a second consumer: promote it deliberately and keep its test.
  **Do not treat it as dead code and delete it** — that removes the released-build guard from
  both apps.
- `validatePublishedBuildApiUrl` (`api-url.ts:43`) is the **build-time** wrapper and has no
  caller outside `api-url.test.ts`: `app.config.ts` computes `EAS_BUILD_PROFILE`
  (`app.config.ts:4`) but never calls it, so the guard never fires at config time — the runtime
  check above is what actually protects a published build. Settle this one in R1: wire it into
  `app.config.ts` (now that it would protect two apps) or drop it, but do not re-export it from
  `mobile-kit` unexamined.

**Acceptance:** `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm lint` all green;
zero changes to any existing test assertion; **`apps/mobile` boots on a device and the moved
components still render styled** (the glob regression is invisible to CI). Android is sufficient
for this one — see "Device verification" under Phases.

**Risks to validate here, in this order** (`mobile-kit` is a smaller guinea pig than R3):

1. Does the moving set compile under the destination's strictness? Settle the tsconfig question
   above and typecheck the moved files before anything else — this is the risk that bites on day
   one, and it is cheap to answer.
2. Does a package containing `.tsx` typecheck downstream with a source-only `exports` map, and
   does `className` typecheck inside the package? Note that with `types` pointing at source, every
   consumer typechecks the package's `.ts`/`.tsx` under its own tsconfig; `skipLibCheck` does not
   cover them, so a type error in the package surfaces in each app's `typecheck`.
3. **Separately from 2 — does the NativeWind babel transform reach a package file?** Typechecking
   `className` and compiling it are two different mechanisms, and passing 2 says nothing about this
   one. Answer it on a device with one moved `className` component, before R3 moves the screens.
   See the third NativeWind bullet above.
4. Does a `jest-expo` config inside a package work for its own component tests, *with the shared
   harness resolved from `./testing`*? If not, apply bail-out step 1.

#### R1 outcome — what the four day-one items settled

1. **tsconfig base: `tsconfig.base.json`.** The RN packages inherit the repo's strictness like
   every other package; they are not an exception. The whole moving set compiles under
   `exactOptionalPropertyTypes` with **one** casualty: `bouncable-press.tsx` passed
   `className={className}` explicitly, which `exactOptionalPropertyTypes` rejects. It now flows
   through the rest spread instead, which is optional-to-optional and needs no cast.
2. **Content glob widened and verified.** `apps/mobile/tailwind.config.js` scans
   `../../packages/*/src/**/*.{ts,tsx}` and consumes `@bnewapp/mobile-kit/theme/tailwind-preset`
   instead of requiring the app-local palette. Proven by compiling the app's CSS with a utility
   that exists only in a package file and finding it in the output.
3. **The NativeWind babel transform does reach `packages/`, and this is checkable in CI.** A real
   Metro bundle (`expo export --platform android --no-bytecode`) compiles
   `packages/mobile-kit/src/ui/*.tsx` through `nativewind/jsx-runtime`, and `w-[84%]` — a class
   present only in `dance-skeleton.tsx` — lands in the bundle's injected style registry as
   `{width:"84%"}`. The plan expected this to be device-only; it is not. A device run is still
   worth having for final confidence, but the invisible-failure mechanism is now covered by an
   automatable check.
4. **`jest-expo` runs inside a package. The bail-out is not triggered.** All four moving suites
   pass from `packages/mobile-kit` with the harness resolved through `./testing/jest/config`, and
   no existing assertion changed.

Three decisions the phase forced that the plan left open or assumed:

- **Shared jest fragment shape: a spreadable config object**, `mobileKitJestConfig`, merged beside
  `preset: "jest-expo"`. Each app spreads it and adds its own `moduleNameMapper` entries. Every
  path inside it is a `require.resolve` relative to the fragment, never `<rootDir>`.
- **No god barrel — one `exports` entry per concern.** A single `.` barrel made every consumer
  load `expo-audio`, which broke four `apps/mobile` suites that never touch audio. Metro does not
  tree-shake, so this was a bundling cost too, not only a test artifact: `apps/edu` would have had
  to declare `expo-audio` to render a button. The map is now `.` (transport, auth, jotai,
  react-query — no native imports), `./ui`, `./expo`, `./testing`, the two media hooks as separate
  entries because their native dependencies are disjoint, plus the CJS theme and jest entries.
  **Record this for R3:** `dance-flow` must be split the same way.
- **`validatePublishedBuildApiUrl` is wired, not dropped — and gated on `EAS_BUILD`.**
  `app.config.ts` calls it, and `npx expo config` was confirmed to resolve a TypeScript source
  subpath from the package (`@bnewapp/mobile-kit/api-url`) and to fail the config load for a
  staging/production profile with a missing or non-HTTPS `EXPO_PUBLIC_API_URL`.
  **The profile alone is not the trigger:** `mobile:prebuild` runs the *staging* profile locally to
  generate the native projects, while `.env` deliberately leaves `EXPO_PUBLIC_API_URL` unset so
  devices reach Metro's LAN host — so an ungated guard breaks local prebuild. It fires only when
  `EAS_BUILD === "true"`, which is the case that actually ships a bundle. `requirePublishedApiUrl`
  still protects both apps at launch. `apps/edu` must copy the gate, not just the call.

**Outstanding from R1:** the Android device run. The two failures it was meant to catch are now
covered by the checks above, so this is confirmation rather than discovery.

### R2 — De-app-ify the dance feature

Smaller than it first appears, because `queryAuthAtom` moves to `mobile-kit` in R1 and both apps
write it. What remains app-specific inside the flow:

- `api.ts` reads the module-level `apiUrl`. **Decision: a one-time
  `configureDanceFlow({ apiUrl, mmkvId })` called at app bootstrap and read lazily on each call,
  not a factory.** `__tests__/api.test.ts` imports the api functions directly as module-level
  functions and asserts with `expect.stringContaining("/api/dance/…")`, so lazy config keeps every
  existing test and assertion intact; a factory would rewrite all of them. The cost is mutable
  module state, so the accessor must throw a named error when read before configuration.
- `_atoms/ui.ts` hardcodes `new MMKV({ id: "dance" })` and the `dance:v1:` prefix → part of the
  same injected config, so `apps/edu` cannot collide with `apps/mobile` storage semantics.

  **"Read lazily on each call" does not solve this half, and the gap has to be closed in this
  phase.** `ui.ts:5` constructs `new MMKV({ id: "dance" })` at **module scope**, and lines 28 and 34
  create the persisted atoms at module scope too. Lazy per-call reads work for `api.ts`, whose
  exports are functions invoked per request; they cannot work for a constructor that runs at import
  time, before any bootstrap `configureDanceFlow()` could execute — Expo Router loads the module
  graph first. The MMKV side therefore needs a different mechanism: lazy initialization that builds
  the `MMKV` instance and the atoms on first read, or a configure-before-first-read guard throwing
  the same named error. **Decide it here**, not in P0 when `apps/edu` collides with the `dance`
  MMKV id.
- `__DEV__`-gated simulated-recording toggles stay, but their host menu is app-owned.

**Acceptance:** none of the files listed for `dance-flow` — and none of the `_atoms` exports listed
as *flow* in R3 — has any `@/` import left, including via an R1 shim; the moving set imports
`@bnewapp/mobile-kit` directly. The criterion is deliberately scoped to that set:
`dance-post-detail-screen.tsx` keeps `@/components/app-header`, and the four staying screens keep
`@/lib/theme/colors` through its shim. Existing tests unchanged and green.

#### R2 outcome

`features/dance/config.ts` holds `configureDanceFlow({ apiUrl, mmkvId })`, a
`DanceFlowNotConfiguredError`, the lazy `danceApiUrl()` accessor and `persistedDanceAtom()`.
`apps/mobile` supplies its values from `src/lib/bootstrap/dance-flow.ts`, imported for side effect
by the root layout.

- **MMKV mechanism settled: lazy initialization on first read.** The "configure-before-first-read
  guard" alternative is not merely worse, it cannot work: jotai's `atomWithStorage` calls
  `storage.getItem` when the atom is *created* (`utils.mjs:452`, under `getOnInit: true`), and the
  atoms are created at module load, so any guard would throw before a bootstrap call could run.
  `persistedDanceAtom` returns a proxy atom that builds and memoizes the real persisted atom on
  first read.
- **The `dance:v1:` prefix is deliberately *not* injected**, which the plan text left ambiguous
  while its own `configureDanceFlow({ apiUrl, mmkvId })` signature did not include it. A distinct
  MMKV store id already gives full isolation; the prefix is the *flow's* storage schema version,
  so injecting it per app would let two apps silently disagree about it. Only the store id is
  app-owned.
- **Acceptance verified transitively, not per file.** A walk of the import graph from the 14
  moving-set roots reports zero `@/` imports anywhere in the closure, including via an R1 shim.
  The staying screens keep theirs, as intended.
- **Two suites needed a `configureDanceFlow` setup call** — `__tests__/api.test.ts` and
  `ui/__tests__/record-dance-screen.test.tsx`. No assertion changed anywhere, which is what the
  lazy-accessor decision was chosen to buy.
- **One test change was mandatory rather than cosmetic:**
  `ui/__tests__/dance-result-screen.test.tsx` mocks the music hook by path, so the mock had to
  follow the screen to `@bnewapp/mobile-kit/media/use-synced-music-track`; left alone it would
  have silently stopped applying.
- **`configureDanceFlow` is one-shot, and enforced.** The store is memoized on first read, so a
  second call carrying a different `mmkvId` would be silently ignored while `apiUrl` did change —
  a split-brain config rather than a repoint. A repeat call with identical values is a no-op; a
  conflicting one throws `DanceFlowReconfiguredError`.
- **New coverage owned by R2:** `__tests__/config.test.ts` pins the named error, the injected base
  URL, that creating a persisted atom touches no MMKV, that writes land under
  `dance:v1:` in the injected store and not in `apps/mobile`'s, and both sides of the
  reconfiguration guard.
- `mobile-kit` gained one export, `MMKVAtom<T>`, the return type of `createAtomWithMMKV`, so a
  consumer can wrap a persisted atom without redeclaring its shape.

### R3 — `packages/dance-flow`

Move the files listed above; `apps/mobile` re-exports them through its own
`features/dance/index.ts` so route files do not change.

**That re-export covers route files only — staying files hold relative imports into the moving
set, and each one is an edit this phase owns.** Enumerated so they are not discovered during the
move: `learn-dance-screen.tsx:19` imports `danceMoveDetailAtomFamily` from `../_atoms/queries`.
(`choose-dance-moves-screen.tsx:19` is **not** on this list — the catalog trio it imports stays in
`apps/mobile`, so that import keeps working unchanged.) (`./dance-skeleton` is *not* on this list: R1 already moved it and repointed its
three importers — see the note under the `dance-flow` file list.) Nothing
else crosses: `dance-post-grid.tsx`, `dance-post-detail-screen.tsx` and `dance-post-menu.tsx`
touch only staying atoms, and `dance-move-card.tsx` has no relative imports at all.

**The `_atoms/` split is per export, not per file.** Each current file straddles the flow/product
line, and moving them wholesale would ship `apps/edu` the owner-scoped post history it is designed
not to have:

| File | → `dance-flow` | Stays in `apps/mobile` |
|---|---|---|
| `_atoms/queries.ts` | `danceMoveDetailAtomFamily`, `optionalDanceMoveAtomFamily`, `danceScoreQueryKey`, `danceScoreAtom` | `danceGenresAtom`, `danceMovesAtom`, `danceMovesInfiniteAtom` (see the decision below), `dancePostsQueryKey`, `dancePostDetailQueryKey`, `dancePostsInfiniteAtom`, `dancePostsAtom`, `dancePostDetailAtomFamily` |
| `_atoms/mutations.ts` | `submitDanceRecordingMutationAtom` | `deleteDancePostMutationAtom` |
| `_atoms/ui.ts` | `ActiveDanceScan` (type), `activeDanceScanAtom`, `simulatedDanceRecordingEnabledAtom`, `useBackDanceCameraAtom` | `selectedDanceGenreIdAtom`, `selectedDanceMoveIdAtom`, `danceVideoRateAtom` |
| `_atoms/effects.ts` | `startDanceScorePollingAtom` | — |

One coupling point this split must break: the staying post queries share `api.ts` functions with
the flow. The second — `danceMovesInfiniteAtom` reading `selectedDanceGenreIdAtom` from `ui.ts` —
is **not** broken in R3; see the decision below, which keeps both atoms in `apps/mobile`.

**The catalog-list row of that table is decided: `danceGenresAtom`, `danceMovesAtom` and
`danceMovesInfiniteAtom` stay in `apps/mobile`.** They have exactly one consumer in the repo —
`choose-dance-moves-screen.tsx:19`, which this phase leaves in `apps/mobile` — and with the feed
out of this plan there is no second consumer to prove them shared. Moving them would ship a package
advertised as "the record → upload → score flow" owning the b-new-app genre picker's query with
zero in-package callers, while a staying product screen reaches into it. `dance-flow` takes only
the per-move lookups it actually uses: `danceMoveDetailAtomFamily` (`record-dance-screen.tsx:26`)
and `optionalDanceMoveAtomFamily` (`dance-result-screen.tsx:12`).

**Two consequences follow, and the first is the reason this is decided rather than open:**

- **The `selectedDanceGenreIdAtom` coupling break does not happen in R3.** `danceMovesInfiniteAtom`
  keeps reading the app-owned UI atom because both stay in `apps/mobile`. That removes the
  acceptance exception this phase would otherwise have carried, and removes the rewrite of
  `choose-dance-moves-screen.tsx:60` and its suite. When a second consumer appears, take the genre
  id as a parameter then — the guidance above still holds, it just is not R3's work.
- **This does not deliver a clean boundary, and pretending otherwise would mislead.**
  `danceMoveDetailAtomFamily` has two consumers, not one: besides `record-dance-screen.tsx:26` it
  is read by `learn-dance-screen.tsx:19`, a screen that stays. So a staying b-new-app product
  screen still imports its move query from `dance-flow`. The decision is taken for the smaller
  diff, the removed coupling break and the removed acceptance exception — not for a boundary it
  does not achieve. Record it in `packages/AGENTS.md` alongside the RN exception.

**Record why the submit mutation is movable at all.** `submitDanceRecordingMutationAtom` has no
`onSuccess` today (`_atoms/mutations.ts:61-94`), which is the only reason it separates cleanly from
the staying `dancePostsQueryKey` — unlike `deleteDancePostMutationAtom`, which rewrites the cached
post pages directly. The moment the flow's submit needs to refresh `apps/mobile`'s post history,
this seam breaks and the refresh has to arrive as an app-supplied callback, not an import. Cheap to
write down now, expensive to rediscover.

**`dance-flow` needs a `./dev` exports subpath — the "an `exports` map is a closed door" rule sits
under R1 but applies here too.** `features/dance/dev.ts` exists for exactly one reason, stated in
its own header: keep the camera and network stack out of the root layout's module graph. Its only
consumer is `dev-menu.tsx:2`, which stays in `apps/mobile`. Move it into the package behind
`@bnewapp/dance-flow/dev`; if the dev menu has to reach it through the package root instead, it
pulls the screen graph into the root module graph and silently undoes the optimization the file was
created for.

Peer dependencies: `react`, `react-native`, `react-native-reanimated`, `react-native-worklets`,
`jotai`, `jotai-family`, `jotai-tanstack-query`, `@tanstack/react-query`, `expo` (for
`expo/fetch`), `expo-video`, `expo-audio`, `expo-file-system`, `expo-blur`, `react-native-mmkv`,
`react-native-vision-camera`, `react-native-safe-area-context`, `nativewind`. Workspace
dependencies: `@bnewapp/types`, `@bnewapp/dance-core`, `@bnewapp/mobile-kit`.

**Which suites follow the code — R3 needs this table as much as R1 does, and this is the phase
where "can `jest-expo` run inside a package" is stressed at scale rather than on two media hooks.**
R1 moves four suites and names each; R3 moves more, and the `ui/__tests__/` directory splits:

| Suite | Follows |
|---|---|
| `__tests__/api.test.ts` | `api.ts` |
| `__tests__/config.test.ts` | `config.ts` |
| `__tests__/recording-adapter.test.ts` | `recording-adapter.ts` |
| `_atoms/__tests__/queries.test.ts` | `danceScoreAtom` / `activeDanceScanAtom` |
| `_atoms/__tests__/effects.test.ts` | `startDanceScorePollingAtom` |
| `ui/__tests__/record-dance-screen.test.tsx` | `record-dance-screen.tsx` |
| `ui/__tests__/dance-result-screen.test.tsx` | `dance-result-screen.tsx` |
| `ui/__tests__/submission-state.test.ts` | `submission-state.ts` |

**Stays in `apps/mobile`:** `ui/__tests__/{choose-dance-moves-screen,learn-dance-screen,dance-post-grid,dance-post-detail-screen}.test.tsx`.
`score-polling.ts` moves with no suite of its own — it has none today, and R3 does not add one.

**The `_atoms/__tests__/` suites do not need splitting — and that is the problem.** Both files
follow the code into the package wholesale: `queries.test.ts` imports only `danceScoreAtom` and
`activeDanceScanAtom` and its five tests are all score-polling (it never mentions `dancePosts`),
and `effects.test.ts` follows `startDanceScorePollingAtom`. The file move is trivial.

**The real risk is that almost every atom in the split table is untested.** `danceGenresAtom`,
`danceMovesAtom`, `danceMovesInfiniteAtom`, `danceMoveDetailAtomFamily`,
`optionalDanceMoveAtomFamily`, `dancePostsInfiniteAtom`, `dancePostsAtom`,
`dancePostDetailAtomFamily` and **both** mutation atoms have no atom-level coverage at all; only
`danceScoreAtom`, `activeDanceScanAtom` and `startDanceScorePollingAtom` do. So
"`_atoms/__tests__/*` pass unchanged" proves nothing about the split itself — it only proves
score polling still works. Before moving anything, add coverage for the atom this phase actually rewrites,
`danceMovesInfiniteAtom` (the `selectedDanceGenreIdAtom` read), and for
`submitDanceRecordingMutationAtom`'s create → upload → mark sequence and its
`discardUploadingDancePost` rollback. That is new coverage owned by R3, not a suite that follows
the code.

**Acceptance:** every suite in the table above passes without assertion edits, in whichever home
it lands in — **with no exception**, now that the catalog trio stays and
`ui/__tests__/choose-dance-moves-screen.test.tsx` is untouched. Plus: the dance flow verified on a
device end-to-end (record → upload → score).

**State plainly what this acceptance does not prove.** With the feed out of this plan, `dance-flow`
has exactly one consumer — `apps/mobile`, through its own `features/dance/index.ts` re-export — so
green tests and a working device run demonstrate no regression, not that the package is genuinely
app-agnostic. R2's acceptance (no `@/` import left in the moving set) is the only real evidence of
that until a second app consumes it. Do not read R3 green as the boundary being proven.

#### R3 outcome

`packages/dance-flow` holds the flow: `api.ts`, `config.ts`, `dev.ts`, `score-polling.ts`,
`recording-adapter.ts`, `src/_atoms/*` and `src/ui/{record-dance-screen,dance-result-screen,
camera-permission-overlay,submission-feedback,submission-state}`, with all nine suites from the
table beside them. `apps/mobile` keeps the catalog and post-history half of the `_atoms/` split and
re-exports the two screens through `features/dance/index.ts`, so no route file changed.

- **No root `.` entry; six per-concern subpaths** — `./record-screen`, `./result-screen`, `./atoms`,
  `./api`, `./config`, `./dev`. R1's "no god barrel" rule decides the screen split too:
  `react-native-vision-camera` is the record screen's dependency alone, so a consumer that only
  renders a result — including a test — must not be made to declare and mock the camera. A bare
  `@bnewapp/dance-flow` import resolves to nothing, deliberately.
- **`src/_atoms/` keeps its app-feature name inside the package.** The underscore means nothing
  there, but every relative import in the moving set and its suites (`../../api`, `../ui`,
  `../../recording-adapter`) survives the move untouched, which is what let nine suites land with
  zero edits.
- **The `api.ts` coupling is resolved by exporting it, not by splitting it.** `api.ts` moves whole,
  and the staying catalog and post-history atoms import their five functions from
  `@bnewapp/dance-flow/api`. Splitting the file would have split `__tests__/api.test.ts` with it,
  which the phase's own table forbids. The cost is an import-path rewrite in five staying suites
  that mock `"../../api"` — path only, no assertion — and it is the same known leak as
  `danceMoveDetailAtomFamily`, now recorded in `packages/AGENTS.md`.
- **`dev.ts` needed no shim.** `features/dance/dev.ts` is gone; `dev-menu.tsx` imports
  `@bnewapp/dance-flow/dev` directly — one import site, and the file's whole purpose (keeping the
  camera and network stack out of the root module graph) survives because `./dev` reaches only the
  persisted toggles.
- **One `exactOptionalPropertyTypes` casualty, the same class R1 hit.** `RecordDanceScreenProps`
  declared `onBack?: () => void` and passed it explicitly to the inner component; it now reads
  `onBack?: (() => void) | undefined`, the idiom `CreateDancePostBody` already uses.
- **New coverage owned by R3, and one substitution.** `submitDanceRecordingMutationAtom` gained six
  tests (create → upload → mark, the omitted audio offset, `discardUploadingDancePost` rollback on
  both failure points, a failing rollback that must not mask the original error, and the signed-out
  path) and moved into the package with the atom. The plan also asked for `danceMovesInfiniteAtom`
  coverage *because R3 would rewrite it*; the catalog-trio decision removed that rewrite, so the new
  `_atoms/__tests__/catalog-queries.test.ts` in `apps/mobile` guards what R3 actually does to those
  atoms instead — that they still filter by genre, page by server cursor and flatten in order now
  that their transport comes from the package.
- **NativeWind verified by bundle for the new package, not assumed from R1.** In a real Metro export,
  `h-48`, `top-56`, `text-8xl` and `text-violet-300` — classes present only in
  `packages/dance-flow/src/ui/record-dance-screen.tsx` — appear in the injected style registry
  (`{height:168}`, `{top:196}`, `{fontSize:84}`, `{color:"#c4b5fd"}`), and the compiled screen's JSX
  resolves to nativewind's runtime (the module exporting `createInteropElement`). Content glob and
  babel transform both reach `packages/dance-flow`.

**Acceptance:** all nine moving suites pass from the package with no assertion edits
(9 suites / 61 tests); `apps/mobile` is green (19 suites / 112 tests) with
`ui/__tests__/choose-dance-moves-screen.test.tsx` untouched apart from its api mock path;
`corepack pnpm typecheck` and `biome check` are clean across the workspace.

**Outstanding from R3:** the end-to-end device run (record → upload → score), still owed together
with R1's Android confirmation. Nothing in this phase changed the flow's behavior, and the bundle
check above covers the styling failure a device run was meant to catch, so this is confirmation
rather than discovery — but it is not closed.

### R5a — Anonymous identity, the part the scaffold needs

Scoped to what must be true before `apps/edu` can sign in at all: the signup trigger, the invariant
it falsifies, the conversion gap, and the dashboard switch. **Deliberately excluded**, because they
need the scan flow to exist first: the temporary-clip retention sweep, the anonymous-user growth
and abuse policy, and the session-loss recovery behavior. Three things to know when that work is
picked up — `deleteRecordedPost` answers `409` for a post still `uploading`, so a sweep needs a
second branch; `signInAnonymously` talks to GoTrue directly, so `@fastify/rate-limit` never sees
user creation; and local profile data has no owner key, so it survives a lost session by design.

**The auth layer needs no change, and that is verifiable rather than assumed.**
`apps/server/src/plugins/auth.ts` decorates `authenticate` with nothing but `request.jwtVerify()`,
and `AuthUser.email` is already optional — no route requires an email claim, a role, or a
`profiles` row. That is what makes "the existing owner-scoped dance API is reused unchanged" true,
and it is the assumption the whole anonymous-auth decision rests on. Every blocker below is in the
database or the dashboard, not in Fastify.

**Blocker 1 — the signup trigger.** `profiles.email` is `NOT NULL` and the `on_auth_user_created`
trigger inserts `new.email`. An anonymous user has `email = NULL`, so **sign-in fails at the
trigger**.

Recommended fix — make the trigger skip rather than widen the column:

```sql
-- handle_new_user(): insert a profile only for identified users.
if new.email is not null then
  insert into public.profiles (id, email) values (new.id, new.email);
end if;
```

An anonymous user then has no `profiles` row. That is safe for the dance flow — `dance_posts` and
`dance_scans` FK to `auth.users` directly, not to `profiles`, and `apps/edu` never calls
`/api/user/me`. The alternative — making `profiles.email` nullable — would ripple into the
`UserProfile` DTO and both consuming apps for no gain.

**Note why that two-column insert is legal at all**, since it is not obvious and it is load-bearing:
`profiles` also has `username text not null`, and the insert omits it only because
`20260813033848_add_profile_username.sql:5-8` gave the column a `not null default
('dancer-' || lpad(nextval('public.profile_username_seq'), 6, '0'))`. The trigger has never set
`username`. Any future migration that drops or tightens that default breaks the signup path
silently, so the dependency belongs in the migration comment.

**This edits the live signup path of the shipping app.** `on_auth_user_created` is what creates
every `apps/mobile` user's profile row; a mistake here is silent until a real user signs up and
lands without a profile. The phase must prove that an identified signup still inserts a profile
row — not only that an anonymous one no longer fails — and carry a rollback note for the
migration.

**Blocker 2 — the fix falsifies a documented invariant.**
`20260813033848_add_profile_username.sql` adds `studio_rooms_owner_profile_fk → profiles(id)` with
the comment *"Safe because every owner has a profile (signup trigger)."* After the trigger change
that is no longer true. Nothing breaks in practice — `apps/edu` never touches studio rooms — but
this phase must update that comment and the stated invariant, and any future `profiles` FK or
PostgREST embed must stop assuming a profile row exists for every `auth.users` row.

**Blocker 3 — anonymous → permanent conversion has no path.** `on_auth_user_created` is
`after insert on auth.users`; converting an anonymous user into an identified one is an `UPDATE`,
so a converted user would never get a profile row. Either add the update branch now or record it
explicitly as a known limitation of `apps/edu`.

Also in this phase:

- Enable **Anonymous sign-ins** in the Supabase dashboard (external state change → needs explicit
  approval, like `db:push`).

**Acceptance:** an identified signup still inserts a `profiles` row (prove this, it is the shipping
app's path), an anonymous sign-in succeeds and reaches an owner-scoped dance endpoint, and the
migration carries a rollback note plus the corrected `studio_rooms_owner_profile_fk` comment.

#### R5a outcome — what landed and what is still owed

**Landed (local, reversible):**

- `supabase/migrations/20260916131240_allow_anonymous_users.sql`:
  - `handle_new_user()` now guards its insert with `if new.email is not null`, so an anonymous
    sign-in no longer fails at the trigger. The insert gained `on conflict (id) do nothing` so it
    stays idempotent alongside the new update branch.
  - **Blocker 3 is fixed, not recorded as a limitation.** A new
    `on_auth_user_identified` trigger (`after update of email on auth.users`,
    `when (old.email is null and new.email is not null)`) inserts the profile row on an
    anonymous → permanent conversion. The `when` clause is what keeps it off the hot path —
    `auth.users` is updated on every sign-in. The invariant it restores is worth the ten lines:
    *every user with an email has a profile row*, at insert or at conversion.
  - The `studio_rooms_owner_profile_fk` invariant is corrected in place with
    `comment on constraint`, rather than by editing the already-applied
    `20260813033848_add_profile_username.sql`.
  - A rollback note is carried in the migration, including the ordering constraint: disable the
    dashboard switch **before** rolling back, or every anonymous sign-in starts failing at the
    trigger again.
- `supabase/config.toml` gains `[auth] enable_anonymous_sign_ins = true` — the local-stack mirror
  of the dashboard switch, so a local run does not silently disagree with the hosted project.
- `supabase/AGENTS.md` records the durable rule: a `profiles` FK or a PostgREST embed through one
  restricts that relation to identified users, and that intent must be stated on the constraint.

**Two consequences worth knowing before the feature work** (neither is a defect; both follow from
anonymous users having no `profiles` row):

- `GET /api/user/me` answers `404` for an anonymous caller. `apps/edu` never calls it, per the
  decisions table.
- The admin panel's user list and its dashboard counts read from `profiles`
  (`apps/server/src/modules/admin/service.ts`), so they count identified users only. If
  `apps/edu`'s anonymous population ever needs to be visible there, that is a new admin query
  against `auth.users`, not a change to this trigger.

**Verified on `bnewapp(staging)`** (project ref `uuuoellkauugnjtmgvow`, GoTrue `v2.197.0`,
Postgres `17.6.1.155`). `db:push` applied exactly this one migration — `migration list --linked`
showed the other 14 already in sync, so nothing rode along with it. Every check cleaned up its
test users, and `profilesLeft=0` after each delete confirms the cascade still works.

| Check | Result |
|---|---|
| Identified signup still inserts a `profiles` row | **PASS** — `username=dancer-000010`, so the `dancer-NNNNNN` default this insert depends on still fires |
| Anonymous sign-in succeeds, with **no** `profiles` row | **PASS** — `is_anonymous=true`, `role=authenticated`, `profiles=0` |
| Conversion (email added) inserts the `profiles` row | **PASS** — `username=dancer-000011`, so the `after update of email` branch fires |
| Anonymous token reaches an owner-scoped dance endpoint | **PASS** — `GET /api/dance/posts` → `200 {"items":[],"nextCursor":null}` |
| Same endpoint without a token | **PASS** — `401`, so the `200` above is real authentication, not an open route |
| `GET /api/user/me` for an anonymous caller | `404` — the documented consequence, not a defect |

Run order mattered and is worth keeping: the first attempt returned `422 anonymous_provider_disabled`
because the dashboard switch was still off. That is the migration sitting harmlessly ahead of the
switch — the safe intermediate state, and the reason **push before flipping the switch** is the
recorded order.

Two things this settled that were previously hedged:

- **`is_anonymous` is real and reaches the JWT.** It is the discriminator to use if the admin panel
  ever needs to count the `apps/edu` population — a new query against `auth.users`, not a change to
  this trigger.
- **`db:types` produces an empty diff.** No table, column or enum changed, and `supabase gen types`
  does not emit functions returning `trigger`. `database.generated.ts` is untouched by design.

**The dashboard's own two warnings, against this schema:**

- *"Anonymous users will use the `authenticated` role — review your RLS policies."* Already handled.
  All 14 RLS-enabled tables scope by ownership (`auth.uid() = owner_id`), not by role, so an
  anonymous JWT grants access to that anonymous user's own rows and nothing else. No policy grants
  anything to `authenticated` broadly.
- *"Enable captcha to prevent abuse that bloats your database and MAU costs."* Not done, and
  deliberately out of scope — the anonymous-user growth and abuse policy is excluded from R5a by
  the phase's own definition. It belongs with the scan flow's retention work. Note it is now a live
  exposure on staging, not a hypothetical one.

**Still outstanding: the production push.** Only staging is linked in this working copy. Production
needs the same `db:push`, the same dashboard switch, and the same run order — and there the
identified-signup check matters far more than it did here, because that is where real users sign up.

### P0 — Init `apps/edu` (scaffolding only)

- `package.json` (`@bnewapp/edu`), workspace deps `@bnewapp/{types,dance-core,mobile-kit,dance-flow}`.
  **`@bnewapp/types` resolves to `dist`, not to source** — its `exports` map has no `react-native`
  condition, unlike `dance-core` and `studio-core`. `apps/mobile` already lives with this, but a
  fresh clone that runs `edu` before `corepack pnpm build` fails Metro resolution with a missing-module
  error that reads like a workspace-wiring bug. Either note the build step in `apps/edu/AGENTS.md`
  or add the `react-native` condition to `types` (a one-line change that also removes the trap for
  `apps/mobile`). Turbo's `^build` dependency covers `typecheck` and `test`, not `expo start`.
  Include `expo.autolinking.android.buildFromSource: ["expo-video"]` — `apps/mobile` needs it for
  Media3 1.9 (commit `0ea5ec0`) and `apps/edu` inherits `expo-video` through `dance-flow`.
  **Pin `expo-video` to the same resolved version as `apps/mobile` (`~55.0.21`)**: the root
  `pnpm.patchedDependencies` entry is `expo-video@55.0.21`, so a different resolution would make
  the patch silently stop applying to this app.

  **`expo-video` is the loudest case, not the only one — copy `apps/mobile`'s version range
  verbatim for every dependency the two apps share.** `node-linker=hoisted` is what makes this
  matter: a matching range resolves to one hoisted copy, while any drift makes pnpm nest a second
  copy under `apps/edu/node_modules`. Two copies of `react-native-reanimated` or
  `react-native-vision-camera` is a native-module crash, and two copies of `jotai` or
  `@tanstack/react-query` is a silently separate atom store / query cache — the exact failure
  CLAUDE.md §6 warns about, arriving through dependency resolution rather than through code. The
  set to copy is the peer lists of `mobile-kit` and `dance-flow` plus `expo` itself: `expo`,
  `react`, `react-native`, `react-native-reanimated`, `react-native-worklets`,
  `react-native-vision-camera`, `react-native-safe-area-context`, `react-native-mmkv`,
  `expo-audio`, `expo-file-system`, `expo-blur`, `expo-constants`, `expo-device`, `expo-router`,
  `nativewind`, `jotai`, `jotai-family`, `jotai-tanstack-query`, `@tanstack/react-query`.
  `react` and `react-dom` are already forced by the root `pnpm.overrides`; nothing else on that
  list is. **This is also the one place the "peer lists are documentation, not enforcement" framing
  cuts the other way** — hoisting hides a wrong peer entry, but it does not hide a wrong version
  range, it just relocates the damage to runtime. Verify after install that
  `corepack pnpm why <pkg>` reports a single version for each, and that `apps/edu/node_modules`
  contains no nested copy of them.
- `app.config.ts` — the provisional identity from "Decisions locked in": display name `Stepz`,
  `slug: "stepz"`, `scheme: "stepz"`, `ios.bundleIdentifier` / `android.package`
  `com.bnewapp.stepz`. Mirror `apps/mobile`'s `EAS_BUILD_PROFILE` suffix logic (`.dev` /
  `.staging`) so the three profiles do not collide. `NSCameraUsageDescription` must say the
  camera scans movement to calculate a score (a stated product requirement); plus
  `android.permissions: ["android.permission.CAMERA"]` and `experiments.typedRoutes`.
  **The `plugins` array is not a copy-paste detail, and one entry is a build blocker.**
  `apps/mobile` carries a local config plugin, `./plugins/with-ios-min-deployment-target`, that
  forces `IPHONEOS_DEPLOYMENT_TARGET = 16.0` because expo-router 55's pod calls `UIAction.subtitle`
  without an availability guard and cannot compile below iOS 16. `apps/edu` uses the same
  expo-router and **will fail its first iOS build in exactly the same way**. Decide whether the
  plugin is copied into `apps/edu/plugins/` or promoted to a shared location. The array also needs
  `"expo-router"`, `"expo-image"`, and
  `["expo-audio", { recordAudioAndroid: false, enableBackgroundPlayback: false }]` — `dance-flow`'s
  music sync depends on that audio mode.
- `metro.config.js` — copy `apps/mobile`'s monorepo setup in full: `watchFolders`,
  `resolver.nodeModulesPaths`, `resolver.disableHierarchicalLookup = true`, `extraNodeModules`
  pinning `react` / `react-dom` / `react-native` to the workspace root, plus `withNativeWind`.
- `babel.config.js` — `babel-preset-expo` with `{ jsxImportSource: "nativewind" }`. **Not
  optional:** NativeWind's `className` does not compile without it, and nothing else in this list
  substitutes for it.
- `src/global.css` — the `withNativeWind({ input })` target the `metro.config.js` bullet above
  requires.
- `tailwind.config.js` — the `mobile-kit` preset plus a content glob covering `packages/*/src`;
  the Boogiz palette is added as token **value** overrides under the preset's existing token
  names, never raw hex in components.
- `tsconfig.json` (`@/*` paths), `nativewind-env.d.ts`, `expo-env.d.ts`; biome inherits from root.
- **Add `apps/edu/android/` and `apps/edu/ios/` to the root `.gitignore`.** This repo is
  continuous-native-generation throughout: `.gitignore:8-9` ignores both of `apps/mobile`'s native
  directories and **no `eas.json` is tracked anywhere**, so the native projects exist only as
  prebuild output. Miss these two lines and the first `edu:prebuild` commits a few thousand
  generated files. It also keeps biome quiet without a second config — `biome.json` sets
  `vcs.useIgnoreFile: true`, so the gitignore entry is what excludes the native trees from
  `corepack pnpm lint`.
- Test harness: `jest.config.js` built on the `@bnewapp/mobile-kit/testing` preset from R1, so
  `setupFiles`, `setupFilesAfterEnv`, the `\\.css$` style mock and `transformIgnorePatterns`
  (including the `jotai-tanstack-query` entry) all come from one copy.
  **`__mocks__/react-native-mmkv.js` is the exception:** jest auto-applies a `node_modules` manual
  mock only from `<rootDir>/__mocks__`, so `apps/edu` needs a physical file at that path — make it
  a one-line re-export of the package's implementation, not a second copy. Add a
  `moduleNameMapper` entry only if R1 proved one is needed.
- `AGENTS.md` for `apps/edu`. Root `AGENTS.md` requires a scoped one ("Read the nearest scoped
  `AGENTS.md` before changing files in a subdirectory"); `apps/mobile` has one and this app's
  conventions differ (no owner key, local-only profile, Boogiz tokens).
- Root `package.json` scripts, mirroring the mobile set: `edu`, `edu:ios`, `edu:android`,
  `edu:prebuild` plus the `:staging` / `:production` prebuild variants `apps/mobile` already has —
  or a recorded decision that `apps/edu` ships a single prebuild until it has release channels.
- `src/lib/auth/supabase.ts` **and its env values.** R5a keeps `session-provider.tsx` per-app, which
  is right, but `apps/edu` also needs its own Supabase client — `apps/mobile`'s is 19 env-driven
  lines — plus `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the
  `@react-native-async-storage/async-storage` and `react-native-url-polyfill` dependencies that go
  with it. Nothing else in this list is left implicit; neither is this.
- Expo Router skeleton, rooted at **`src/app/`** — `apps/mobile` puts its route tree there rather
  than at the app root, and the `@/*` → `./src/*` paths above have to agree with it:
  `src/app/_layout.tsx` (anonymous session bootstrap + `QueryProvider` + `configureDanceFlow`),
  `src/app/index.tsx` (feed), `src/app/move/[moveId]/scan.tsx`,
  `src/app/move/[moveId]/result.tsx`, `src/app/profile/index.tsx`, `src/app/profile/[moveId].tsx`,
  `src/app/profile/style/[styleId].tsx`.
- Feature folders per the atomic-split standard: `features/{feed,scan,profile}/`.
- Local persistence contract: `new MMKV({ id: "edu" })`, namespace `edu:v1:`, **keyed by
  `moveId`** — no owner key, because there are no user IDs.

**Acceptance:** app builds and runs on iOS and Android showing a placeholder; workspace
`typecheck` / `test` / `lint` green. If no Mac is available, land the split acceptance described
under "Device verification" in Phases — Android verified, iOS explicitly outstanding — rather than
counting P0 complete on Android alone.

## Open decisions

**None of them blocks the start.** The product and data questions that used to sit here — style
cardinality, feed ordering, the personal-recording source, likes, the level filter's option list —
all belonged to the server catalog surface and to the scan flow's retention work, neither of which
is in this plan. With those out, nothing on the list below needs an answer from outside the team
before R1 begins; every entry is settled empirically, inside the phase that raises it.

The app name is **decided provisionally** (see "Decisions locked in") rather than open. It is the
one entry here with a real cost of change, so re-decide it before P0 runs, not after.

| Topic | Question | Settled by |
|---|---|---|
| ~~tsconfig strictness for RN packages~~ | **Settled in R1: `tsconfig.base.json`.** One file needed a fix (`bouncable-press.tsx`) | R1 |
| ~~NativeWind transform scope~~ | **Settled in R1: yes.** Verified in a real Metro bundle, not on a device | R1 |
| ~~Package test home~~ | **Settled in R1: yes.** Bail-out not triggered | R1 |
| ~~Shared jest harness~~ | **Moot — it ships from `mobile-kit/testing`.** No duplication needed | R1 |
| ~~Shared jest fragment shape~~ | **Settled in R1: spreadable config object** (`mobileKitJestConfig`) | R1 |
| ~~MMKV configure mechanism~~ | **Settled in R2: lazy initialization on first read.** The guard alternative cannot work — `atomWithStorage` reads storage at atom *creation* | R2 |
| Device verification owner | Who runs the Android check (R3 end-to-end) and the iOS build (P0)? R1's share of it is now covered by the bundle check; R3 and P0 still need hardware | Before R3 starts — see "Device verification" under Phases |
| Anonymous bootstrap in P0 | Does the scaffold sign in anonymously, or ship a placeholder with no auth? | **Unblocked on staging** — R5a is live there, so P0 can sign in for real against staging. Still a decision for production |
| ~~Trigger rollback~~ | **Settled in R5a: yes.** Proven on staging after the push — an identified signup inserts a profile row and the `dancer-NNNNNN` default still fires | R5a |
