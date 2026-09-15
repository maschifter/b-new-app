# Codebase Cleanup & De-duplication — Plan

Incremental cleanup of duplication and dead code across the monorepo, found in a
full review on 2026-09-15. Baseline at that point: 266 TS/TSX source files,
`corepack pnpm typecheck` and `corepack pnpm lint` both green.

This is **refactoring only**. No behavior change, no new features, no dependency
changes. Every phase must land with the same observable behavior it started with.

## Ground rules

- Run from the repository root with `corepack pnpm`, never bare `pnpm`.
- One commit per phase, landed directly on `master`. Do not bundle phases — the
  point is that each is independently revertible.
- Each phase ends green on: `corepack pnpm typecheck`, `corepack pnpm test`,
  `corepack pnpm lint`. Run `corepack pnpm format` too — `lint` is `biome lint`,
  which does not check import order.
- No unrelated cleanup inside a phase. If something new is spotted, add it to
  §"Backlog / not scheduled" instead of fixing it in place.
- Mobile phases that touch rendered UI need device verification, not just tests.

## What is explicitly NOT in scope

- `apps/server/src/modules/dance/job-queue.ts` and its two workers. The shared
  claim/reap/backoff scaffolding is already the right abstraction; the workers
  differ genuinely in retry and failure semantics. Leave it alone.
- react-admin `Create`/`Edit` component pairs. They are near-identical by
  framework idiom, and collapsing them buys less than it costs in readability.
- `createAdminResourceService` (was Phase 3c). Only 2 of the 4 admin services could
  be rebuilt on it — this plan already excludes `dance-moves` and `catalog` from it —
  so the config surface (table, columns, `toDto`, six message strings, plus the
  music-track FK-conflict hook) would be about nine fields serving two call sites to
  save ~70 lines. Supabase also infers the Result type from the *select string
  literal*, so a generic factory either loses that inference or makes each caller
  thread the row type by hand, which is the boilerplate it set out to delete. The
  two services are flat, obvious CRUD; that duplication is the boring, stable kind.
- Generated files, especially `packages/types/src/database.generated.ts`.

---

## Phase 0 — Dead code removal

Zero-risk deletions. Nothing here has a consumer.

**Risk:** none. **Depends on:** nothing.

- [x] Delete `packages/utils` entirely (package, `tsconfig*.json`, its
      `pnpm-workspace.yaml` coverage is a glob so no edit needed). Its only
      export `isNonEmptyString` has zero consumers and the package is not
      declared as a dependency anywhere in the workspace. Follow the deletion
      with `corepack pnpm install` to drop the `packages/utils: {}` entry at
      `pnpm-lock.yaml:313`.
- [x] Remove the `packages/utils` mention from `CLAUDE.md` §2 and `AGENTS.md`
      §"Project Overview" / §"Architecture Boundaries". While in those two
      sections, add the `apps/admin` and `packages/dance-core` entries they are
      already missing — the workspace map is the thing being corrected, so
      leaving it half-stale defeats the edit.
- [x] Delete `getHealth` in `apps/mobile/src/lib/api/client.ts` (never called).
- [x] Delete `getCurrentUser` in `apps/mobile/src/lib/api/client.ts` (never
      called). Keep `UserProfile` / `HealthStatus` in `packages/types` — the
      server still uses both.
- [x] Decide on `ApiError` in `packages/types/src/index.ts`: it has no importer,
      while `apps/server/src/lib/errors.ts` builds the same `{ code, message }`
      shape inline. Either type the error handler's reply with it, or delete the
      type. Prefer typing the handler — the shape is a real wire contract.
- [x] Drop `export` from interfaces that never leave their defining file, so the
      public surface matches reality: `JobQueueOptions`, `MediaWorkerOptions`,
      `ScanRequest`, `ScanningClientOptions`, `DevRoutesOptions`,
      `List*Options` in **five** admin services (`catalog`, `dance-moves`,
      `dance-genres`, `music-tracks`, plus `ListUsersOptions` in `service.ts`),
      `SubmitDanceRecordingInput`, `ResolveApiUrlOptions`,
      `SyncedMusicTrackOptions`, `BouncablePressProps`. None of them had an
      out-of-file importer, so no `export` had to be kept.

**Acceptance:** `corepack pnpm typecheck && corepack pnpm test && corepack pnpm lint`
green. `turbo` task count drops by one package.

---

## Phase 1 — Server test helpers

Highest value per unit of effort, and it makes Phases 2–4 safe to attempt. Do
this before touching any server source.

**Risk:** low (tests only). **Depends on:** nothing.

The same three helpers are copy-pasted across the suite today:

| Helper | Duplicated in |
|---|---|
| `testConfig` (verbatim) | `admin.test.ts`, `dance-routes.test.ts`, `studio.test.ts`, `shop.test.ts` |
| `httpErrors` object | `admin.test.ts`, `admin-catalog.test.ts`, `admin-dance-content.test.ts`, `dance-media-service.test.ts`, `dance-post-service.test.ts`; `dance-routes.test.ts` and `shop.test.ts` build the same object inline in their fake Fastify app |
| chainable Supabase query-builder mock | 11 files |

The query-builder copies have **drifted**: `shop.test.ts` stubs
`["select","eq","in","order","update"]` while `admin.test.ts` stubs
`["select","order","range","or","eq","gte","update"]`. A local mock missing the
method the code under test calls produces a confusing crash — or, worse, a pass
down an unintended path. This is the real reason to fix it, not tidiness.

- [x] Create `apps/server/tests/helpers/config.ts` exporting `testConfig`.
- [x] Create `apps/server/tests/helpers/http-errors.ts` exporting `httpError`
      and the `httpErrors` object (`badRequest`, `forbidden`, `conflict`,
      `notFound`, `internalServerError`, `serviceUnavailable`).
- [x] Create `apps/server/tests/helpers/supabase.ts` exporting one
      `queryBuilder(result)` that stubs the **union** of every method currently
      stubbed anywhere, plus `single`, `maybeSingle`, and the `then` thenable
      (keep the `biome-ignore lint/suspicious/noThenProperty` comment).
- [x] Migrate the 4 `testConfig` files. `health.test.ts` is **not** one of
      them: it inlines three config literals that deliberately differ
      (`NODE_ENV: "production"`, `ALLOWED_ORIGINS`). Only fold it in if the
      helper takes an override argument; otherwise leave it alone.
- [x] Migrate the 5 `httpErrors` files.
- [x] Migrate the 11 query-builder files **one at a time**, running that file's
      tests after each. Where a local mock was deliberately narrower (asserting a
      method is *not* reached), keep the local variant and add a comment saying
      why — do not force it onto the shared helper.
- [x] Note any test that changes behavior under the wider mock. That is a
      finding, not a merge blocker; record it in the PR description.

**Acceptance:** `corepack pnpm --filter @bnewapp/server test` green with the same
number of passing tests as before. No production file touched.

---

## Phase 2 — `pickDefined` for partial-update builders

Mechanical, easy to verify, removes a whole class of bug.

**Risk:** low. **Depends on:** Phase 1 (so the admin services have a safety net).

Four hand-written builders repeat `...(body.x === undefined ? {} : { x: body.x })`:

- `apps/server/src/modules/admin/dance-genres-service.ts:35` `genreUpdate` (3 keys)
- `apps/server/src/modules/admin/music-tracks-service.ts:38` `trackUpdate` (7 keys)
- `apps/server/src/modules/admin/catalog-service.ts:47` `catalogUpdate` (6 keys)
- `apps/server/src/modules/admin/dance-moves-service.ts:67` `moveUpdate` (**15 keys**, ~30 lines)

The failure mode being removed: adding a field to the Zod update schema and
forgetting to add it to the builder, so the API silently accepts and drops it.

- [x] Add `pickDefined<T, K extends keyof T>(source: T, keys: readonly K[])` to a
      new `apps/server/src/lib/pick-defined.ts`. It must satisfy
      `exactOptionalPropertyTypes` and return a type Supabase's `.update()`
      accepts — verify against the strictest caller (`moveUpdate`) first.
- [x] Add a unit test: omitted key absent from the result, explicit `null`
      preserved, explicit `undefined` dropped.
- [x] Replace `moveUpdate` first (biggest win, strictest types).
- [x] Replace `trackUpdate`, `catalogUpdate`, `genreUpdate`.
- [x] Derive each key list from the update schema where possible
      (`UpdateDanceMoveBody`) rather than retyping it, so the two cannot drift.
      Done via `<schema>.keyof().options`, so each list *is* the schema's key set at
      runtime. `danceMoveFields` was split into `danceMoveColumns` plus a `genre_ids`
      extension, because that field is written to the join table rather than the row.

**Acceptance:** admin route tests green unchanged; `moveUpdate` down to ~2 lines.

---

## Phase 3 — Shared admin resource service

The largest single refactor. Do not start it before Phases 1 and 2 are merged.

**Risk:** medium. **Depends on:** Phase 1, Phase 2.

`dance-genres-service.ts` (115 lines) and `music-tracks-service.ts` (127 lines)
are effectively the same file with a different table name: same
`SORTABLE_COLUMNS` guard, same `if (options.ids?.length === 0) return { rows: [], total: 0 }`,
same `q?.replace(/[,%]/g, "").trim()` sanitizer, same `range(start, max(end-1, start))`,
same `{ rows, total }` return, same error ladder.

`normalizeStatus` is copy-pasted **verbatim three times**:
`dance-genres-service.ts:28`, `music-tracks-service.ts:31`, `dance-moves-service.ts:49`.

- [x] Step 3a — extract `parseDanceContentStatus` to a single module. Landed in
      `modules/admin/dance-content-schemas.ts` rather than `lib/`, so it reuses the
      Zod `status` enum already defined there instead of restating the literals;
      `DanceContentStatus` never leaves the server, so `packages/types` was not
      needed. All three copies replaced.
- [x] Step 3b — **reduced in scope.** The plan assumed all four services shared one
      list-query block differing only in the search clause. Re-reading them, only the
      three pure expressions are shared 4/4: the `SORTABLE_COLUMNS` guard, the
      `[,%]` sanitizer, and `max(end - 1, start)`. The `ids` short-circuit and the
      `{ rows, total }` return are 3/4 — `catalog-service` has no `ids` branch at all —
      and `dance-moves-service` picks its select string *before* `.order()` based on
      `genreId`, so the two branches produce different `PostgrestFilterBuilder` types.
      A builder-threading `applyListQuery` would therefore have to be generic over
      Supabase's inference, where a loose constraint silently widens the Result type
      flowing into `toAdminMove`.
      Shipped instead: `lib/admin-list.ts` with `sortColumn`, `searchTerm` and
      `rangeEnd` — plain functions, adopted by all four services, unit-tested. The
      filter chaining stays explicit in each service, where it genuinely differs.
- [x] Step 3c — **dropped.** See "What is explicitly NOT in scope".

**Acceptance:** `admin*.test.ts` green with **no test edits**. If a test has to
change, the refactor changed behavior — investigate before proceeding.

---

## Phase 4 — Server constants and select strings

**Risk:** low. **Depends on:** Phase 3 (avoid conflicting edits in the same files).

- [x] Create `apps/server/src/lib/pg-error-codes.ts` with
      `UNIQUE_VIOLATION = "23505"`, `FOREIGN_KEY_VIOLATION = "23503"`,
      `CHECK_CONSTRAINT_VIOLATION = "23514"`. Replace the local consts
      (`FOREIGN_KEY_VIOLATION` in `dance-moves-service.ts:26` and
      `music-tracks-service.ts:17`, `CHECK_CONSTRAINT_VIOLATION` in
      `catalog-service.ts:20`) and the bare `"23505"` literals at
      `catalog-service.ts:116` and `admin/service.ts:129`. No `UNIQUE_VIOLATION`
      const exists today — it is introduced by this phase, which is the point.
- [x] Compose the dance-move select strings instead of retyping the column list:
      Each base literal is `as const` and the derived ones are `as const` template
      literals, so Supabase still infers the Result type from the select string.
      `MOVE_COLUMNS` → `MOVE_WITH_GENRES` → `MOVE_WITH_GENRES_AND_FILTER` in
      `admin/dance-moves-service.ts:19-24` (20 columns typed out three times),
      and `MOVE_SELECT` → `MOVE_SELECT_WITH_GENRE` in `dance/service.ts:17-19`
      (twice more).
- [x] Do **not** try to share one column list between the admin and consumer
      services — they select deliberately different column sets. Compose within
      each file only.

**Acceptance:** tests green; the 20-column string appears once per file at most.

---

## Phase 5 — Admin app constants

**Risk:** very low. **Depends on:** nothing.

- [x] Add `STATUS_CHOICES = [{ id: "draft", name: "Draft" }, { id: "published", name: "Published" }]`
      to a shared module under `apps/admin/src/`. It is currently repeated in
      eight files: `catalog-list`, `catalog-form`, `genre-list`, `genre-form`,
      `move-list`, `move-form`, `track-list`, `track-form`. Landed in
      `apps/admin/src/resources/choices.ts`; all eight adopted.
- [x] Add `ACCESS_CHOICES` for the free/premium pair in the catalog resource.
      **Dropped.** The two lists share ids but not labels: `catalog-list` filters on
      `Free` / `Premium`, while `catalog-form` deliberately explains the choice
      (`Free (granted to every user)` / `Premium (requires purchase)`). One shared
      constant would change visible text, and two constants would serve one call site
      each. Left as is.

**Acceptance:** `corepack pnpm --filter @bnewapp/admin test` green; admin UI
renders the same filter and form options.

---

## Phase 6 — Mobile query-atom helper

**Risk:** medium (touches every feature's server state). **Depends on:** nothing,
but schedule after the server phases so mobile and server churn do not overlap.

Every `_atoms/queries.ts` repeats the same preamble:

```ts
const auth = get(queryAuthAtom);
get(queryErrorResetVersionAtom);
return {
  queryKey: [name, auth?.userId ?? null, ...],
  enabled: auth !== null,          // omitted on the suspense variants
  queryFn: async () => {
    if (!auth) throw new Error("Not authenticated");
    return call(auth.accessToken, ...);
  },
};
```

`"Not authenticated"` appears 14 times across `apps/mobile/src`.

- [x] Add `apps/mobile/src/lib/jotai/authed-query.ts` exporting a helper that
      takes the getter, a key suffix, and `(auth) => Promise<T>`, and returns the
      options object with `queryKey` (userId-scoped), the reset-version
      subscription, the `enabled` guard, and the unauthenticated throw.
      **Reduced in scope.** A full options-object helper does not survive the four
      atom flavors: `queryKey` is typed per atom (`(string | null)[]` on the infinite
      atoms, a `readonly` tuple in shop), the infinite `queryFn` takes `{ pageParam }`
      while the plain one takes nothing, `catalogAtom` deliberately returns the
      fallback instead of throwing, and `danceScoreAtom`'s `enabled` also depends on
      `activeDanceScanAtom`. Threading all of that through one generic either widens
      the option types or hands each caller more boilerplate than it removes.
      Shipped instead: two plain functions —
      `readQueryAuth(get, { errorBoundaryReset })` (reads the auth projection and
      subscribes to the reset signal) and `requireAuth(auth)` (the single
      `"Not authenticated"` throw). Every option literal stays at its call site, so
      no generics are involved and no deviation had to be encoded.
- [x] It must support all four atom flavors in use. All four adopted
      `readQueryAuth`; being option-free, it is flavor-agnostic.
- [x] Migrate one feature at a time: `catalog` → `shop` → `explore` → `dance`.
      `requireAuth` also replaced the same throw in `shop` and `dance` mutation
      atoms, so one `"Not authenticated"` string is left in the whole app — in
      legacy `studio-sync.tsx`, which holds a raw token rather than a `QueryAuth`.
- [x] Preserve every per-atom deviation exactly. `explore-room`'s `retry: false`,
      `catalog`'s `initialData`/`initialDataUpdatedAt`/`staleTime`, `danceScore`'s
      `gcTime: 0`/`refetchInterval`/`retryDelay` and shop's `throwOnError` are all
      untouched. The three atoms that do not subscribe to `queryErrorResetVersionAtom`
      (`optionalDanceMoveAtomFamily`, `dancePostsInfiniteAtom`, `danceScoreAtom`) now
      say so with `{ errorBoundaryReset: false }`. `danceScoreAtom`'s combined
      `if (!auth || !scan)` guard split: `requireAuth` covers auth, and the `!scan`
      branch now throws `"No active dance scan"` — unreachable either way, since
      `enabled` already requires both.
- [x] Do not change any `queryKey`. No key was touched.

**Acceptance:** all mobile feature tests green with no test edits; manual check
that sign-out → sign-in as another user still clears the previous user's data.

---

## Phase 7 — Mobile test render helper

**Risk:** low (tests only). **Depends on:** Phase 6 (so it is written against the
final atom shape).

Seventeen test files each rebuild the same wrapper: `createStore()` →
`new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } })`
→ `store.set(queryClientAtom, queryClient)` → `store.set(queryAuthAtom, …)` →
nested `<Provider><QueryClientProvider>`.

- [x] Add `apps/mobile/src/test-utils/render-with-providers.tsx` exposing the
      store and query client to the caller (several tests assert on them). Ships
      three pieces: `createTestQueryClient(overrides)` (merges over
      `gcTime: Infinity, retry: false`), `createTestStore({ queryClient, auth })`
      (the store-only variant), and `renderWithProviders(ui, options)`, which
      returns the render result plus `store` and `queryClient`.
- [x] Migrate the 17 files. **15 migrated; 2 left alone, deliberately:**
      - `lib/auth/__tests__/session-provider.test.tsx` — it tests the provider that
        *writes* the auth atom, so it must not be seeded, and its client keeps
        react-query's default `retry` on purpose. Its local `mount` wrapper stays.
      - `dance/_atoms/__tests__/queries.test.ts` — `danceScoreAtom` owns its own
        retry/refetch policy, so the client must leave `retry` at the default
        rather than take the helper's `retry: false`. Kept local with a comment
        saying why; the file is otherwise unchanged.
      `dance/_atoms/__tests__/effects.test.ts` needed no change either: it drives
      plain atoms and never builds a query client.
      The four `_atoms`/state tests use the store-only `createTestStore`, as planned.
- [x] Check `jest.config.js` `moduleNameMapper` / `testPathIgnorePatterns` so the
      new `test-utils/` directory is not collected as a test suite. No edit needed:
      jest-expo collects `__tests__/**` and `*.test.*`, and `src/test-utils/` is
      neither. Suite count is unchanged at 29.

**Acceptance:** `corepack pnpm --filter @bnewapp/mobile test` green, same test count.

---

## Phase 8 — Mobile color tokens

**Risk:** low, but visible. **Depends on:** nothing.

Colors already named in `apps/mobile/tailwind.config.js` are also hardcoded as
hex in TS, at places where NativeWind `className` does not reach (`tintColor`,
`Ionicons color`, gradient stops):

| Hex | Token | Occurrences |
|---|---|---|
| `#8B5CF6` | `primary` | 5 |
| `#A78BFA` | `neon` | 6 |
| `#F8F7FC` | `foreground` | 6 |
| `#4A4856` | `border` | 2 |

- [x] Create the single source of truth. Landed as
      `apps/mobile/src/lib/theme/colors.js` (CommonJS) plus a sibling `colors.d.ts`,
      not a `.ts` file: `tailwind.config.js` is loaded by Node at Metro start, which
      cannot `require` TypeScript. The `.d.ts` is inside the tsconfig `include` glob,
      so `@/lib/theme/colors` is fully typed for app code while Metro bundles the
      `.js`. It carries the whole palette, not just the four duplicated tokens.
- [x] Make `tailwind.config.js` `require` it. It now holds no hex at all; the
      resolved `theme.extend.colors` is byte-identical to the previous literal.
- [x] Replace the hardcoded hexes above with token references. 19 sites:
      `COLORS.primary` ×5, `COLORS.neon` ×6 (including `item-picker`'s local `NEON`
      const, now deleted), `COLORS.foreground` ×6, `COLORS.border` ×2 —
      `room-row`'s icon color, and `spot-layer`'s `border-[#4A4856]` className, which
      became the `border-border` utility rather than a TS constant.
- [x] Leave the one-off hexes that are **not** theme tokens alone. Untouched.
- [ ] Device-verify: Studio, Shop, Explore, Dance record + result screens.

**Acceptance:** screenshots unchanged; `tailwind.config.js` holds no literal hex.

---

## Phase 9 — Mobile API layer consistency

**Risk:** low. **Depends on:** Phase 0.

- [x] Move `getStudioRoom` and `saveStudioRoom` into `features/studio/api.ts`.
      `client.ts` now keeps only `apiUrl`, `authHeaders`, `jsonHeaders`,
      `unwrapApiSuccess`.
- [x] Update `studio-sync.tsx` and its tests to import from the feature module.
- [x] Decide the runtime-validation standard and write it down. **Chose (a).**
      `unwrapApiSuccess(response, errorMessage, options)` gained two opt-ins:
      `parse` (validate the envelope's `data` at the boundary) and `serverError`
      (raise the server's own `{ message }` on a failure instead of the fallback).
      Both default off, so every existing caller behaves exactly as before. The
      standard is recorded as the **HTTP** bullet in CLAUDE.md §6: validate what is
      expensive to get wrong — a balance, an entitlement, anything the user is
      charged for — and surface server messages where the failure is actionable.
- [x] Apply the decision to `features/shop/api.ts`. Its `errorMessage`,
      `responseData` and `readResponse` are gone; the five field parsers stay,
      which is the part that was never duplication.

**Acceptance:** shop and studio tests green; no feature deep-imports another
feature's `api.ts`.

---

## Phase 10 — Shared package boundaries

The most architecturally valuable phase, and the one that touches both apps.
Schedule last so it lands on an otherwise-stable tree.

**Risk:** medium-high (cross-app). **Depends on:** all previous phases.

### 10a — `coerceDancePostStatus` (smallest, do first)

`apps/server/src/modules/dance/service.ts:98-105` re-declares the exact
`DancePostStatus` list and a `toDancePostStatus` coercer that
`packages/dance-core/src/status.ts:3-18` already has — it just is not exported.

- [x] Export `isDancePostStatus` from `packages/dance-core`. The predicate, not a
      coercer: `coercePostStatus` stays internal and keeps its `"uploading"` default,
      now implemented on top of the predicate so the list exists once.
- [x] Delete `POST_STATUSES` and `toDancePostStatus` from the server service.
- [x] Keep the server's "invalid status → 500" behavior. The throw stays at the
      call site in `toDancePost`. Pinned by a dance-core test covering every stored
      status plus an unknown one, an empty string and `null`.

### 10b — shared fallback catalog

Identical, character for character, in two places:

```ts
CATALOG.map((item) => ({ ...item, name: defaultItemLabel(item.id), status: "published", access: "free" }))
```

- `apps/server/src/modules/catalog/service.ts:21` (`FALLBACK_ITEMS`)
- `apps/mobile/src/features/catalog/_atoms/queries.ts:14` (`FALLBACK_CATALOG`)

The blocker: `CatalogItemDTO` lives in `packages/types`, and `types` depends on
`studio-core` — so `studio-core` cannot currently return that type.

- [x] Move `CatalogItemDTO`, `StudioCatalog`, `CatalogItemStatus` and
      `CatalogItemAccess` into `packages/studio-core` (`src/types.ts`).
- [x] Re-export them from `packages/types`. No consumer import path changed.
- [x] Add `fallbackCatalog(): StudioCatalog` to `studio-core` with a unit test
      (published/free/slug-named, version 0, tags preserved, fresh object per call).
- [x] Replace both copies — `catalog/service.ts`'s `FALLBACK_ITEMS` and
      `catalog/_atoms/queries.ts`'s `FALLBACK_CATALOG`.
- [x] Verify the Metro resolver still picks the `react-native` export condition.
      `package.json#exports` is untouched (`react-native` → `src/index.ts`); the
      mobile suite resolves through the same entry via its jest `moduleNameMapper`
      and is green, and the built `dist/index.js` exports `fallbackCatalog` too.

### 10c — `hydrateSnapshot`

The `migrate(coerceSnapshot(...))` → `templateById(id) ?? ROOM_TEMPLATE` →
`reconcile(...)` pipeline appears five times:

- `apps/server/src/modules/studio/routes.ts:74`, `:106`, and `:144`
  (the last deliberately has **no** `?? ROOM_TEMPLATE` — a write must reject an
  unknown template rather than silently retarget it)
- `apps/mobile/src/features/studio/state/atoms.ts:52`, `:81`
- `apps/mobile/src/features/explore/ui/explore-room-screen.tsx:38`

- [x] Add `hydrateSnapshot(raw, catalog)` to `studio-core` for the **read** path
      only (`src/hydrate.ts`), plus `templateOrDefault(templateId)` — the
      `templateById(id) ?? ROOM_TEMPLATE` fallback, which is the piece actually
      repeated 4/4. Unit-tested: kept/dropped placements, unusable input, and a
      retired template rendering against the default.
- [x] Leave the write path explicit, with a comment saying why.
- [x] Replace the read-path call sites. **Fewer than the plan assumed:** only the
      two in `studio/routes.ts` (`buildExploreRoom` and `GET /room`) run the full
      pipeline. `explore-room-screen.tsx` renders a snapshot the server already
      reconciled, so it needed only `templateOrDefault`; `atoms.ts:52` is the
      deliberately un-reconciled half of the split below and `atoms.ts:81` starts
      from an already-migrated value, so it too takes only `templateOrDefault`.
- [x] Keep `apps/mobile/.../atoms.ts`'s split between `persistedDecorationAtom`
      (migrated, **not** reconciled) and `decorationAtom` (reconciled). Kept, with
      a comment at `decorationAtom` saying why `hydrateSnapshot` is wrong there.

### 10d — shop service stops re-parsing the decoration map

`apps/server/src/modules/shop/shop-service.ts:25` `placedCatalogItemIds()`
hand-rolls `ContentRef` validation (`source === "catalog"` + `typeof id === "string"`)
that `coerceSnapshot` already performs.

- [ ] Either route it through `coerceSnapshot`, or export a narrow
      `catalogItemIdsIn(map)` from `studio-core`.
- [ ] Add a studio-core test covering a map that mixes `catalog` and `video`
      refs plus malformed entries.

**Acceptance:** full `corepack pnpm test` green; server starts; mobile builds and
the Studio/Explore/Shop screens render a real room end to end on device.

---

## Progress

| Phase | Area | Risk | Status |
|---|---|---|---|
| 0 | Dead code removal | none | [x] |
| 1 | Server test helpers | low | [x] |
| 2 | `pickDefined` | low | [x] |
| 3 | Shared admin resource service | medium | [x] 3a + reduced 3b; 3c dropped |
| 4 | Server constants & select strings | low | [x] |
| 5 | Admin app constants | very low | [x] STATUS_CHOICES only |
| 6 | Mobile query-atom helper | medium | [x] reduced |
| 7 | Mobile test render helper | low | [x] |
| 8 | Mobile color tokens | low | [x] code; device check pending |
| 9 | Mobile API layer consistency | low | [x] |
| 10 | Shared package boundaries | medium-high | [ ] |

Phases 0, 1, 5 and 8 are independent and can be done in any order or in
parallel. Phase 3 requires 1 and 2. Phase 7 should follow 6. Phase 10 should be
last.

---

## Backlog / not scheduled

Noted during the review, deliberately left out. Revisit only if the surrounding
code is being changed anyway.

- Skeleton components (`dance-skeleton`, `explore-skeleton`,
  `explore-room-skeleton`, `shop-skeleton`) repeat the
  `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`
  pair and a local `SKELETON_KEYS` array. A `<SkeletonBlock>` primitive would
  help, but the four layouts are genuinely different shapes.
- `formatRelativeTime` in `apps/mobile/src/features/explore/ui/room-row.tsx:39`
  is currently used once. Promote it to a shared helper only when a second
  caller appears.
- `packages/studio-core` and `packages/dance-core` have byte-identical
  `package.json` scripts, `tsconfig*.json` and `vitest.config.ts`. A shared base
  tsconfig would remove ~20 lines; low value at two packages, worth doing at four.
- `apps/server/src/modules/admin/routes.ts` and `dance-content-routes.ts` repeat
  a six-handler CRUD block per resource (~150 of 237 lines in the latter). A
  `registerAdminResource` helper is tempting, but Fastify route registration is
  where a wrong abstraction is most expensive to debug. Only attempt after
  Phase 3 proves the service-layer factory holds up.
