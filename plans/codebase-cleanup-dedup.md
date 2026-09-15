# Codebase Cleanup & De-duplication — Plan

Incremental cleanup of duplication and dead code across the monorepo, found in a
full review on 2026-09-15. Baseline at that point: 266 TS/TSX source files,
`corepack pnpm typecheck` and `corepack pnpm lint` both green.

This is **refactoring only**. No behavior change, no new features, no dependency
changes. Every phase must land with the same observable behavior it started with.

## Ground rules

- Run from the repository root with `corepack pnpm`, never bare `pnpm`.
- One phase per branch/PR. Do not bundle phases — the point is that each is
  independently revertible.
- Each phase ends green on: `corepack pnpm typecheck`, `corepack pnpm test`,
  `corepack pnpm lint`.
- No unrelated cleanup inside a phase. If something new is spotted, add it to
  §"Backlog / not scheduled" instead of fixing it in place.
- Mobile phases that touch rendered UI need device verification, not just tests.

## What is explicitly NOT in scope

- `apps/server/src/modules/dance/job-queue.ts` and its two workers. The shared
  claim/reap/backoff scaffolding is already the right abstraction; the workers
  differ genuinely in retry and failure semantics. Leave it alone.
- react-admin `Create`/`Edit` component pairs. They are near-identical by
  framework idiom, and collapsing them buys less than it costs in readability.
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
| `httpErrors` object | `admin.test.ts`, `admin-catalog.test.ts`, `admin-dance-content.test.ts`, `dance-media-service.test.ts`, `dance-post-service.test.ts` |
| chainable Supabase query-builder mock | 11 files |

The query-builder copies have **drifted**: `shop.test.ts` stubs
`["select","eq","in","order","update"]` while `admin.test.ts` stubs
`["select","order","range","or","eq","gte","update"]`. A local mock missing the
method the code under test calls produces a confusing crash — or, worse, a pass
down an unintended path. This is the real reason to fix it, not tidiness.

- [ ] Create `apps/server/tests/helpers/config.ts` exporting `testConfig`.
- [ ] Create `apps/server/tests/helpers/http-errors.ts` exporting `httpError`
      and the `httpErrors` object (`badRequest`, `forbidden`, `conflict`,
      `notFound`, `internalServerError`, `serviceUnavailable`).
- [ ] Create `apps/server/tests/helpers/supabase.ts` exporting one
      `queryBuilder(result)` that stubs the **union** of every method currently
      stubbed anywhere, plus `single`, `maybeSingle`, and the `then` thenable
      (keep the `biome-ignore lint/suspicious/noThenProperty` comment).
- [ ] Migrate the 4 `testConfig` files. `health.test.ts` is **not** one of
      them: it inlines three config literals that deliberately differ
      (`NODE_ENV: "production"`, `ALLOWED_ORIGINS`). Only fold it in if the
      helper takes an override argument; otherwise leave it alone.
- [ ] Migrate the 5 `httpErrors` files.
- [ ] Migrate the 11 query-builder files **one at a time**, running that file's
      tests after each. Where a local mock was deliberately narrower (asserting a
      method is *not* reached), keep the local variant and add a comment saying
      why — do not force it onto the shared helper.
- [ ] Note any test that changes behavior under the wider mock. That is a
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

- [ ] Add `pickDefined<T, K extends keyof T>(source: T, keys: readonly K[])` to a
      new `apps/server/src/lib/pick-defined.ts`. It must satisfy
      `exactOptionalPropertyTypes` and return a type Supabase's `.update()`
      accepts — verify against the strictest caller (`moveUpdate`) first.
- [ ] Add a unit test: omitted key absent from the result, explicit `null`
      preserved, explicit `undefined` dropped.
- [ ] Replace `moveUpdate` first (biggest win, strictest types).
- [ ] Replace `trackUpdate`, `catalogUpdate`, `genreUpdate`.
- [ ] Derive each key list from the update schema where possible
      (`UpdateDanceMoveBody`) rather than retyping it, so the two cannot drift.

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

- [ ] Step 3a — extract `parseDanceContentStatus` to a single module (server
      `lib/`, or `packages/types` if it should be shared with admin). Replace all
      three copies. Land this on its own; it is independently useful.
- [ ] Step 3b — extract the list-query builder:
      `applyListQuery(query, { ids, start, end, sort, order, sortable, defaultSort })`.
      Adopt it in genres, tracks, moves, and the catalog service. Keep each
      service's own search clause (they differ: `ilike` on one column, `or` across
      two, `or` across three plus a JSON path) — pass it in as a callback.
- [ ] Step 3c — extract `createAdminResourceService({ table, columns, sortable, defaultSort, notFoundMessage, errorMessages, toDto })`
      covering `list` / `get` / `create` / `update` / `delete`.
- [ ] Rebuild `dance-genres-service` on it (simplest, no special cases).
- [ ] Rebuild `music-tracks-service` on it. Its `delete` has an extra FK-violation
      → `conflict` branch; express that as an optional per-service hook, not an
      `if (table === …)` inside the shared factory.
- [ ] Leave `dance-moves-service` and `catalog-service` on the shared **list** and
      **status** helpers only. Their create/update carry real extra logic
      (genre join replacement, required-video validation, art upload,
      check-constraint mapping) — forcing them into the factory would make it
      worse, not better.
- [ ] Re-read the resulting factory. If it has grown more than two boolean or
      optional-hook parameters, stop and keep the services separate. A config
      object with six escape hatches is worse than the duplication it replaced.

**Acceptance:** `admin*.test.ts` green with **no test edits**. If a test has to
change, the refactor changed behavior — investigate before proceeding.

---

## Phase 4 — Server constants and select strings

**Risk:** low. **Depends on:** Phase 3 (avoid conflicting edits in the same files).

- [ ] Create `apps/server/src/lib/pg-error-codes.ts` with
      `UNIQUE_VIOLATION = "23505"`, `FOREIGN_KEY_VIOLATION = "23503"`,
      `CHECK_CONSTRAINT_VIOLATION = "23514"`. Replace the local consts
      (`FOREIGN_KEY_VIOLATION` in `dance-moves-service.ts:26` and
      `music-tracks-service.ts:17`, `CHECK_CONSTRAINT_VIOLATION` in
      `catalog-service.ts:20`) and the bare `"23505"` literals at
      `catalog-service.ts:116` and `admin/service.ts:129`. No `UNIQUE_VIOLATION`
      const exists today — it is introduced by this phase, which is the point.
- [ ] Compose the dance-move select strings instead of retyping the column list:
      `MOVE_COLUMNS` → `MOVE_WITH_GENRES` → `MOVE_WITH_GENRES_AND_FILTER` in
      `admin/dance-moves-service.ts:19-24` (20 columns typed out three times),
      and `MOVE_SELECT` → `MOVE_SELECT_WITH_GENRE` in `dance/service.ts:17-19`
      (twice more).
- [ ] Do **not** try to share one column list between the admin and consumer
      services — they select deliberately different column sets. Compose within
      each file only.

**Acceptance:** tests green; the 20-column string appears once per file at most.

---

## Phase 5 — Admin app constants

**Risk:** very low. **Depends on:** nothing.

- [ ] Add `STATUS_CHOICES = [{ id: "draft", name: "Draft" }, { id: "published", name: "Published" }]`
      to a shared module under `apps/admin/src/`. It is currently repeated in
      eight files: `catalog-list`, `catalog-form`, `genre-list`, `genre-form`,
      `move-list`, `move-form`, `track-list`, `track-form`.
- [ ] Add `ACCESS_CHOICES` for the free/premium pair in the catalog resource.

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

- [ ] Add `apps/mobile/src/lib/jotai/authed-query.ts` exporting a helper that
      takes the getter, a key suffix, and `(auth) => Promise<T>`, and returns the
      options object with `queryKey` (userId-scoped), the reset-version
      subscription, the `enabled` guard, and the unauthenticated throw.
- [ ] It must support all four atom flavors in use: `atomWithQuery`,
      `atomWithSuspenseQuery`, `atomWithInfiniteQuery`,
      `atomWithSuspenseInfiniteQuery`. If one helper cannot serve all four
      cleanly under the generics, ship two (`authedQuery` / `authedInfiniteQuery`)
      rather than a single `any`-shaped one — `noExplicitAny` is an error here.
- [ ] Migrate one feature at a time, running that feature's tests after each:
      `catalog` → `shop` → `explore` → `dance`.
- [ ] Preserve every per-atom deviation exactly: `explore-room`'s `retry: false`,
      `catalog`'s `initialData` / `initialDataUpdatedAt` / `staleTime`,
      `danceScore`'s `gcTime: 0` / `refetchInterval` / `retryDelay`,
      `optionalDanceMoveAtomFamily` deliberately **not** subscribing to
      `queryErrorResetVersionAtom` (it shares a key with the suspense twin).
- [ ] Do not change any `queryKey`. A changed key silently invalidates cache
      identity and the auth-switch cleanup contract in CLAUDE.md §6.

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

- [ ] Add `apps/mobile/src/test-utils/render-with-providers.tsx` exposing the
      store and query client to the caller (several tests assert on them).
- [ ] Migrate the 17 files: `explore-screen`, `explore-room-screen`,
      `shop-screen`, `studio-flow`, `studio-sync`, `studio-provider`,
      `studio/state/atoms`, `catalog/_atoms/queries`, `dance/_atoms/queries`,
      `dance/_atoms/effects`, `dance-result-screen`,
      `choose-dance-moves-screen`, `dance-post-grid`, `record-dance-screen`,
      `learn-dance-screen`, `dance-post-detail-screen`, `session-provider`.
      The four `_atoms`/state tests drive atoms directly rather than rendering a
      screen, so they may need a store-only variant of the helper — do not force
      a render on them.
- [ ] Check `jest.config.js` `moduleNameMapper` / `testPathIgnorePatterns` so the
      new `test-utils/` directory is not collected as a test suite.

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

- [ ] Create `apps/mobile/src/lib/theme/colors.ts` as the single source of truth.
- [ ] Make `tailwind.config.js` `require` it, so the Tailwind theme and the TS
      constants cannot drift.
- [ ] Replace the hardcoded hexes above with token references.
- [ ] Leave the one-off hexes that are **not** theme tokens (`#160E29`,
      `#241436`, `#140A20`, `#060410`, `#F6F1E6`, …) alone unless a token
      obviously covers them — inventing tokens for gradient stops is scope creep.
- [ ] Device-verify: Studio, Shop, Explore, Dance record + result screens.

**Acceptance:** screenshots unchanged; `tailwind.config.js` holds no literal hex.

---

## Phase 9 — Mobile API layer consistency

**Risk:** low. **Depends on:** Phase 0.

- [ ] Move `getStudioRoom` and `saveStudioRoom` out of
      `apps/mobile/src/lib/api/client.ts` into `features/studio/api.ts`, matching
      the per-feature `api.ts` convention in CLAUDE.md §6 that every other
      feature already follows. `client.ts` keeps only `apiUrl`, `authHeaders`,
      `jsonHeaders`, `unwrapApiSuccess`.
- [ ] Update `studio-sync.tsx` and its tests to import from the feature module.
- [ ] Decide the runtime-validation standard and write it down in CLAUDE.md §4 or
      §6. Today `features/shop/api.ts` hand-rolls `errorMessage` /
      `responseData` / `readResponse` and validates every field, while every
      other feature casts straight through `unwrapApiSuccess`. The duplication is
      secondary — the inconsistency is the actual problem. Pick one:
      - (a) promote a validating `unwrapApiSuccess(response, message, parse)`
        overload to the shared client and give shop's parsers a home there, or
      - (b) accept trusting our own server and simplify shop onto plain
        `unwrapApiSuccess`.
      Recommendation: (a) — keep the validation, share the plumbing. The shop
      response carries a wallet balance, which is the one payload where a silent
      shape mismatch is expensive.
- [ ] Apply the decision to `features/shop/api.ts`.

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

- [ ] Export `isDancePostStatus` (and/or `coerceDancePostStatus`) from
      `packages/dance-core`.
- [ ] Delete `POST_STATUSES` and `toDancePostStatus` from the server service.
- [ ] Keep the server's "invalid status → 500" behavior: dance-core's internal
      coercer defaults to `"uploading"`, which is **not** what the service wants.
      Export a predicate and let the service keep its own throw, or export both.
      Add a dance-core test pinning whichever contract is chosen.

### 10b — shared fallback catalog

Identical, character for character, in two places:

```ts
CATALOG.map((item) => ({ ...item, name: defaultItemLabel(item.id), status: "published", access: "free" }))
```

- `apps/server/src/modules/catalog/service.ts:21` (`FALLBACK_ITEMS`)
- `apps/mobile/src/features/catalog/_atoms/queries.ts:14` (`FALLBACK_CATALOG`)

The blocker: `CatalogItemDTO` lives in `packages/types`, and `types` depends on
`studio-core` — so `studio-core` cannot currently return that type.

- [ ] Move `CatalogItemDTO`, `StudioCatalog`, `CatalogItemStatus` and
      `CatalogItemAccess` into `packages/studio-core`. They are studio-domain
      shapes, not transport-only DTOs, so this is the right home rather than a
      workaround.
- [ ] Re-export them from `packages/types` so no consumer import path changes.
- [ ] Add `fallbackCatalog(): StudioCatalog` to `studio-core` with a unit test.
- [ ] Replace both copies.
- [ ] Verify the mobile Metro resolver still picks `studio-core`'s
      `react-native` export condition (`src/index.ts`) after the type move.

### 10c — `hydrateSnapshot`

The `migrate(coerceSnapshot(...))` → `templateById(id) ?? ROOM_TEMPLATE` →
`reconcile(...)` pipeline appears five times:

- `apps/server/src/modules/studio/routes.ts:74`, `:106`, and `:144`
  (the last deliberately has **no** `?? ROOM_TEMPLATE` — a write must reject an
  unknown template rather than silently retarget it)
- `apps/mobile/src/features/studio/state/atoms.ts:52`, `:81`
- `apps/mobile/src/features/explore/ui/explore-room-screen.tsx:38`

- [ ] Add `hydrateSnapshot(raw, catalog)` to `studio-core` for the **read** path
      only, returning the reconciled snapshot.
- [ ] Leave the write path at `studio/routes.ts:144` explicit. Its missing
      fallback is a deliberate invariant, not an oversight — folding it into the
      shared helper would turn "unknown template → 400" into a silent rewrite.
      Add a comment at the call site saying so.
- [ ] Replace the four read-path call sites.
- [ ] Keep `apps/mobile/.../atoms.ts`'s split between `persistedDecorationAtom`
      (migrated, **not** reconciled) and `decorationAtom` (reconciled). The
      comment there explains why: reconciling the persisted value against a
      temporarily-stale catalog would turn a read into a destructive sync write.

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
| 1 | Server test helpers | low | [ ] |
| 2 | `pickDefined` | low | [ ] |
| 3 | Shared admin resource service | medium | [ ] |
| 4 | Server constants & select strings | low | [ ] |
| 5 | Admin app constants | very low | [ ] |
| 6 | Mobile query-atom helper | medium | [ ] |
| 7 | Mobile test render helper | low | [ ] |
| 8 | Mobile color tokens | low | [ ] |
| 9 | Mobile API layer consistency | low | [ ] |
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
