# Explore — Browse Other Users' Rooms

> Detailed plan for the feature: the Explore tab shows a list of other users' rooms;
> the user can scroll through them and tap any room to view it (read-only).

## Decisions locked in

| Topic | Choice | Notes |
|---|---|---|
| Card thumbnail | **Mini-render of a scaled-down `StudioStage`** inside each card | Zero backend work; spots are normalized 0..1 so scaling is free. If it measurably lags, revisit server-side thumbnail images later |
| Room owner info | Add a **`username`** column to `profiles` | Auto-generated as a neutral `dancer-NNNNNN` handle from a database sequence; a username-editing screen is out of scope for v1 |
| Which rooms are listed | Only rooms with **≥1 item after reconcile** | Avoids a feed full of empty rooms or rooms containing only stale placements |
| Sort order | `updated_at desc, id desc` | Recently decorated rooms first; `id` is the deterministic tie-breaker |
| Read access to others' rooms | **Through the server using the secret key**; do not open public-read RLS | A future privacy setting only needs a server-side filter |
| Caching visited rooms | **react-query cache only**, never MMKV | MMKV is reserved for the user's own room; no eviction concerns |
| AI rules/skills (Phase 0) | Self-contained; **no mention of or pointer to any reference repo** | Written as this app's native conventions; examples use this app's own code |

## Current state (starting point)

- The Explore tab is a "Coming soon" placeholder: `apps/mobile/src/app/(tabs)/explore.tsx`.
- The renderer is already read-only capable: `StudioStage` has `mode: "edit" | "preview" | "visit"`; `SpotLayer.onPress` is optional. Passing `template + map` renders any room.
- Studio atoms are already keyed by `ownerId`; `StudioSync` only runs when `ownerId === session.user.id`, so a visited room can never be synced by mistake.
- DB: `studio_rooms (owner_id unique, version, template_id, map jsonb, updated_at)` with owner-only RLS. `profiles` has `email` only, no `username` yet.
- Server: `GET/PUT /api/studio/room` (own room) in `apps/server/src/modules/studio/routes.ts`, with the `coerce → migrate → reconcile` pipeline in place.
- Mobile data fetching: plain fetch via `apps/mobile/src/lib/api/client.ts` + `@tanstack/react-query`. `jotai-tanstack-query` is not installed yet.

## Architecture overview

```
Explore tab (FlatList, 2-column grid, infinite scroll)
  │  exploreRoomsInfiniteAtom (jotai-tanstack-query, cursor pagination)
  ▼
GET /api/studio/rooms?limit&cursorUpdatedAt&cursorId   (Bearer JWT)
GET /api/studio/rooms/:ownerId            (Bearer JWT)
  │  secret key bypasses RLS; every snapshot runs coerce → migrate → reconcile
  ▼
Supabase: studio_rooms ⋈ profiles(username)   (via studio_rooms.owner_id → profiles.id FK)
```

> **Join prerequisite:** PostgREST can only embed `profiles(username)` from
> `studio_rooms` if a foreign key connects them. Today both tables only FK to
> `auth.users`, so no relationship is detectable and the embed would fail. Phase 1
> adds `studio_rooms.owner_id → profiles.id` to make the embed resolve.

Visited rooms are **pure server data** (react-query cache); they never touch the MMKV/sync layer.

**Execution order:** Phase 0 → 1 → 2 → 3 → 4 → 5, one commit per phase.

---

## Phase 0 — AI rules/skills for this app (before any feature code)

Goal: future AI sessions know this app's coding patterns without any external reference.
**Constraint: the content must be self-contained — no mention of or pointer to any reference repo.**

### 0.1. Synchronize shared repository guidance

> **Convention note:** the atomic-split layout below (`_atoms/` with
> `queries.ts`/`mutations.ts`/`ui.ts`/`effects.ts`, `jotai-tanstack-query` for
> feeds) is a **new** convention introduced by this feature. The existing studio
> feature predates it and uses `state/{atoms.ts, studio-provider.tsx,
> studio-sync.tsx}` with no react-query. Document `_atoms/` as the go-forward
> standard and explicitly call studio the legacy shape — do not describe studio as
> already following it. Explore is the first feature to use it.

Keep durable cross-agent rules in `AGENTS.md` and scoped `AGENTS.md` files. `CLAUDE.md`
imports `@AGENTS.md` and contains only additional project context that does not contradict the
shared guidance. Keep procedural mobile workflow in `.agents/skills/bnewapp-mobile-feature`;
the skill reads the shared guidance rather than duplicating it.

Sections to keep synchronized; illustrative examples come from this app's own code (studio for
persisted-local state, explore for the new feed convention):

1. **Project overview + key technologies** — Turborepo/pnpm, Expo + expo-router, Fastify, Supabase, jotai + MMKV, react-query.
2. **Monorepo structure & layering rules** — `apps/mobile`, `apps/server`, `packages/studio-core` (pure RN-free domain), `packages/types` (shared DTOs). Rules: mobile never imports server; pure domain logic goes to `studio-core`; DTOs go to `types`.
3. **Essential commands** — dev, typecheck, test, db workflow (keep the existing Database workflow section).
4. **API layer** — plain REST via Fastify modules (`apps/server/src/modules/<domain>/routes.ts`), Bearer JWT (`app.authenticate`, `request.user.sub`), Zod input validation on the server, `ApiSuccess<T>` responses. State explicitly: **no** RPC framework / DI container — keep Fastify modules simple.
5. **"Adding a new endpoint" workflow** — migration → `db:push` → `db:types` → DTO in `packages/types` → server route → mobile api fn → atom/query.
6. **Mobile state management — atomic split rules**:
   - Feature folder: `apps/mobile/src/features/<feature>/` with a narrow `index.ts` public
     entry point and only the folders it needs. For growing state, use `_atoms/` split by
     concern (`queries.ts`, `mutations.ts`, `ui.ts`, `effects.ts`); do not create empty files.
   - One concern per atom; components subscribe only to the atoms they need (`useAtomValue`/`useSetAtom`).
   - Server state = react-query atoms (`jotai-tanstack-query`); client state = plain jotai atoms; local persistence = `createAtomWithMMKV`, keyed by `ownerId`, versioned namespace (`<feature>:v1:`). Authenticated query keys include the current `userId`.
   - Lists/feeds: `atomWithInfiniteQuery` + cursor pagination, derived atom flatMapping pages.
7. **List screen composition** — screen → list (FlatList) → item card; pull-to-refresh; skeleton on `isPending`; `ListEmptyComponent`; infinite scroll via `hasNextPage`/`isFetchingNextPage`.
8. **Navigation** — expo-router file-based routing; detail routes receive params via segments (`app/room/[ownerId].tsx`).
9. **Code style** — English for code/comments/commits; no narrative comments; naming conventions.

### 0.2. Shared repository skill `.agents/skills/bnewapp-mobile-feature`

Use the repository skill from both AI environments:

- **Scope**: own mobile feature implementation and read server, package, and database context to
  align contracts and behavior; use the matching repository skill when the task crosses layers.
- **Reference strategy**: for API-touching tasks → find the DTO in `@bnewapp/types`, read the corresponding server route to match behavior/edge cases.
- **Architecture rules**: public feature entry point plus the concern-based atomic split in
  `apps/mobile/AGENTS.md`; import through `index.ts` outside the feature and create only needed
  atom files.
- **Working style + guardrails**: restate the task, list files to change, short plan before non-trivial edits, no broad refactors or new dependencies without discussion.

**Phase 0 deliverable**: synchronized `AGENTS.md`, `CLAUDE.md`, and repository skill guidance,
submitted for user review before starting Phase 1.

---

## Phase 1 — Database migration

`corepack pnpm db:new add_profile_username`:

```sql
create sequence public.profile_username_seq;

-- The default covers both existing rows and concurrent signups still using the
-- current trigger, which omits username from its insert.
alter table public.profiles
  add column username text not null default (
    'dancer-' || lpad(nextval('public.profile_username_seq'::regclass)::text, 6, '0')
  );

alter sequence public.profile_username_seq owned by public.profiles.username;

alter table public.profiles
  add constraint profiles_username_unique unique (username);

-- Embed prerequisite: let PostgREST join profiles(username) from a room row.
-- Safe because every owner has a profile (signup trigger). After this, owner_id
-- carries TWO FKs (auth.users + profiles); the embed profiles(username) stays
-- unambiguous because this is the only FK targeting profiles. If PostgREST still
-- can't resolve it, disambiguate with the constraint name:
--   profiles!studio_rooms_owner_profile_fk(username)
alter table public.studio_rooms
  add constraint studio_rooms_owner_profile_fk
  foreign key (owner_id) references public.profiles(id) on delete cascade;

-- Index supporting the Explore query (rooms with items only)
create index studio_rooms_explore_idx
  on public.studio_rooms (updated_at desc, id desc)
  where map <> '{}'::jsonb;
```

Adding a column with a volatile sequence default rewrites and locks `profiles` while existing
rows receive handles. Before pushing, inspect the row count and apply during an acceptable lock
window; if the table has grown enough for that lock to be unsafe, split this into an additive
multi-migration rollout. Also preflight for `studio_rooms.owner_id` values without a matching
`profiles.id` before adding the foreign key.

No RLS changes (`studio_rooms` stays owner-only; the server reads with the secret key).

`username` is `NOT NULL` and unique, so the generated database type and the Phase 2 DTO
both expose it as a non-null string. A future editing flow must replace one valid username
with another; it does not require a nullable staging state.

Then, after explicit approval: **review migration → `corepack pnpm db:push` →
`corepack pnpm db:types` → commit** `database.generated.ts`.

> **Hard prerequisite for Phase 3:** the regenerated `database.generated.ts` must
> include the new `studio_rooms → profiles` relationship (today `Relationships` is
> `[]`). The Phase 3 embed `profiles(username)` only type-checks against the
> regenerated types, so Phase 3 cannot compile until this commit lands. Do not skip
> `db:types` here.

## Phase 2 — Shared DTOs (`packages/types`)

```ts
// A feed item intentionally omits StudioRoom.id because the current schema has one
// room per owner and ownerId is the public stable key. Reuse the rest of StudioRoom
// rather than duplicating its snapshot and timestamp fields.
type ExploreRoom = Omit<StudioRoom, "id"> & {
  username: string // non-null database invariant from Phase 1
}

interface ExploreRoomsPage {
  items: ExploreRoom[]
  nextCursor: ExploreRoomsCursor | null
}

interface ExploreRoomsCursor {
  updatedAt: string
  id: string
}
```

## Phase 3 — Server (`apps/server/src/modules/studio/routes.ts`)

Follow the existing route pattern (preHandler `app.authenticate`, `ApiSuccess<T>`).

- **`GET /api/studio/rooms?limit&cursorUpdatedAt&cursorId`** → `{ data: ExploreRoomsPage }`
  - Zod-validated query: `limit` (default 20, max 50) plus optional cursor pair:
    `cursorUpdatedAt` (ISO timestamp) and `cursorId` (UUID). Require both or neither.
  - Query: `studio_rooms` joined with `profiles` for `username`; filter `map <> '{}'` and
    `owner_id <> sub`; order by `updated_at desc, id desc`; fetch `limit+1` rows. When a
    cursor is present, keep rows where `(updated_at, id) < (cursorUpdatedAt, cursorId)` in
    that descending keyset order.
  - Compute `nextCursor` from the last **raw DB row consumed** among the first `limit` rows
    when the extra row proves more data exists; otherwise return `null`. Do this before
    dropping rooms after reconcile, so pagination never depends on returned item counts.
  - Per row (on the first `limit` rows): `coerce → migrate → reconcile`; **drop rooms whose map is empty after reconcile** (only stale placements left).
  - The cursor is based on the raw keyset boundary, not the last returned room. This prevents
    dropped rooms, tied timestamps, or an already-seen room moving forward after an update
    from making the next request re-read an earlier boundary. Rooms updated ahead of the
    cursor during an active traversal appear after refresh rather than being injected into
    the middle of the current traversal.
- **`GET /api/studio/rooms/:ownerId`** → `{ data: ExploreRoom | null }`
  - Zod-validated `ownerId` as uuid; same reconcile pipeline; joined username.

Tests (following the existing route-test shape): empty-room filtering, empty-after-reconcile
dropping, caller exclusion, `nextCursor` pagination, tied `updated_at` values using `id` as the
tie-breaker, and an already-returned room updated between page requests. Also cover missing or
invalid auth, invalid `limit`, a half-specified/invalid cursor pair, invalid detail `ownerId`,
Supabase list/detail failures, and missing room → `data: null`.

## Phase 4 — Mobile (`apps/mobile/src/features/explore/`)

New dependency: `jotai-tanstack-query` (agreed — this is the list/feed standard from Phase 0).

- **Root query provider**: keep the existing `QueryClientProvider` and stable `QueryClient` in
  `apps/mobile/src/lib/providers/query-provider.tsx`. Add a small nested hydrator using
  `useHydrateAtoms([[queryClientAtom, client]])` so React Query hooks and Jotai query atoms use
  that exact client and share one cache. Add a focused provider test that proves both APIs
  resolve the same client.
- **Auth bridge**: add `apps/mobile/src/lib/auth/query-auth-atom.ts` exporting one writable
  `queryAuthAtom` whose value is `{ userId: string; accessToken: string } | null`. Update
  `AuthSessionProvider` to write the corresponding projection for the initial `getSession()`
  result and every `onAuthStateChange` event. The React context remains the session source for
  components; the atom is its query-layer projection, not a second auth client. Give
  `AuthSessionProvider` access to the shared `QueryClient` and centralize session transitions
  there. Every authenticated query key includes `userId`. When a session signs out or changes
  user, first set `queryAuthAtom` to null, cancel in-flight queries for the previous user, remove
  that user's query entries, and only then enable the next identity. A same-user token refresh
  updates `accessToken` without changing its query key or cache. Remove the current
  `queryClient.clear()` responsibility from `SignOutButton` so explicit sign-out, session expiry,
  and account replacement all follow the same cleanup path. Serialize overlapping auth events so
  a stale cleanup cannot disable a newer session. Test initial hydration, same-user token refresh,
  explicit sign-out, non-interactive session expiry, and direct account replacement from A to B.

```
features/explore/
├── index.ts             # public exports: ExploreScreen, ExploreRoomScreen
├── _atoms/
│   ├── queries.ts    # exploreRoomsInfiniteAtom + exploreRoomQueryAtomFamily
│   └── ui.ts         # exploreRoomsAtom (derived: flatMap pages)
├── ui/
│   ├── explore-screen.tsx
│   ├── explore-room-screen.tsx
│   ├── room-card.tsx
│   ├── explore-empty.tsx
│   └── explore-skeleton.tsx
└── api.ts            # getExploreRooms / getExploreRoom via lib/api/client
```

- **`api.ts`**: `getExploreRooms(token, { limit, cursor })`, `getExploreRoom(token, ownerId)`.
- **`_atoms/queries.ts`**: `exploreRoomsInfiniteAtom = atomWithInfiniteQuery(...)`
  - Read `queryAuthAtom` in the options getter and use
    `queryKey: ["explore-rooms", auth?.userId ?? null]`, `initialPageParam: null`.
  - Pass `auth.accessToken` to the query function and set `enabled: auth !== null`; never call
    `useAuthSession()` from an atom module or use an unchecked auth cast. Guard the nullable auth
    value inside `queryFn` before calling the API so TypeScript and runtime behavior agree even if
    the function is invoked manually while disabled.
  - `queryFn` passes `pageParam` to `getExploreRooms` as the optional cursor.
  - `getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined`. The cursor comes
    from the raw DB boundary, so never derive it from `items.length` or page count.
  - `exploreRoomQueryAtomFamily(ownerId)` uses `atomWithQuery` with
    `queryKey: ["explore-room", auth?.userId ?? null, ownerId]`, the same guarded auth
    projection, and `getExploreRoom`. The detail request is server state and follows the same
    query-atom standard as the feed.
- **`_atoms/ui.ts`**: `exploreRoomsAtom` — flatMap `pages → items`.
- **`ui/room-card.tsx`**:
  - `StudioStage` takes `template` + `map` + `mode` (not `snapshot`, and it has no
    `pointerEvents` prop). Derive `template = templateById(snapshot.templateId) ?? ROOM_TEMPLATE`
    and pass `snapshot.map`.
  - Mini-render: container keeps the 390:844 design aspect ratio; inside, `StudioStage mode="preview"`
    wrapped in a `<View pointerEvents="none">` (in preview/visit mode `onSelectSpot` is already
    ignored, so this is belt-and-suspenders); overlay with `username` + relative time.
  - Card wrapped in `Pressable` → `router.push("/room/" + ownerId)`. Give the card
    `accessibilityRole="button"`, a label that identifies the owner's room, and a reasonable
    touch target without exposing the decorative mini-stage as separate accessible content.
- **`ui/explore-screen.tsx`**:
  - `FlatList` with `numColumns={2}`, pull-to-refresh (`refetch`), `onEndReached` → `fetchNextPage` (guarded by `hasNextPage && !isFetchingNextPage`).
  - A raw page may reconcile to zero items while `nextCursor` still points to valid later rows.
    After each successful fetch, inspect the newly received last page. If that page has zero
    items and a non-null `nextCursor`, trigger exactly one guarded `fetchNextPage()`, even when
    earlier pages already contributed items. Repeat only after that request settles; stop when
    the new page contributes an item or its cursor is null. Key the effect to the last page/cursor
    so an unchanged render cannot launch the same request twice. This prevents both a false empty
    state and a traversal stalled behind an empty middle page without overlapping requests or a
    render-loop.
  - `isPending` → skeleton; empty → `explore-empty`; footer spinner while `isFetchingNextPage`.
  - Perf: `removeClippedSubviews`, small `windowSize`, `keyExtractor = ownerId`.
- **`index.ts`**: export only `ExploreScreen` and `ExploreRoomScreen`; keep cards, atoms, and
  API functions private to the feature.
- **`app/(tabs)/explore.tsx`**: replace the placeholder with `ExploreScreen`, imported from
  `@/features/explore`.
- **Detail route `app/room/[ownerId].tsx`**: keep it thin — parse and validate the route param,
  then render `ExploreRoomScreen ownerId={ownerId}`, imported from `@/features/explore`.
- **Root `app/_layout.tsx`**: declare `<Stack.Screen name="room/[ownerId]" />` inside the
  existing `Stack.Protected guard={session !== null}` block alongside `(tabs)` and `profile`.
  Do not rely on automatic filesystem registration: that would make the route eligible outside
  the authenticated group. Add a navigation test proving a signed-out deep-link cannot render
  the room screen.
- **`ui/explore-room-screen.tsx`**:
  - Read `exploreRoomQueryAtomFamily(ownerId)` and render its pending, not-found, error, and
    success states. The query key scopes cached data to the authenticated viewer.
  - Render full-screen `StudioStage mode="visit"` (background + spots; no picker/edit avatar),
    header with username + back button.
  - The back control has `accessibilityRole="button"`, an explicit localized label, and at
    least a 44×44 point hit target. Decorative stage/card imagery is hidden from the
    accessibility tree when its content is already summarized by the surrounding control.
  - Own the loading/not-found states. Never write to MMKV.

## Phase 5 — Verify

- Confirm `corepack pnpm --version` matches `package.json#packageManager`, then run typecheck
  across all five workspaces and the three existing test workspaces (mobile, server,
  studio-core), followed by the repo lint command.
- Add focused RNTL coverage for loading, populated, terminal-empty, footer loading and error
  states. Include a first page with `items: []` plus a non-null cursor followed by a populated
  page, a `populated → empty → populated` sequence, and an all-empty sequence that terminates
  when `nextCursor` becomes null. Assert each cursor is requested exactly once. Query the room
  card and detail back control by accessibility role/label and verify their actions.
- Add route tests asserting **no duplicate `ownerId` across sequential pages** when rooms are
  dropped post-reconcile, timestamps tie, or an already-returned room is updated between
  requests (guards the Phase 3↔4 cursor contract).
- Validate the Explore query plan on representative data with `EXPLAIN (ANALYZE, BUFFERS)`.
  Confirm the query's `map <> '{}'` filter matches the `studio_rooms_explore_idx` predicate and
  that the planner can use the index for the cursor/order access pattern. Do not fail the check
  solely because a small table chooses a cheaper sequential scan; record the row estimates,
  timing, and planner rationale, and retest with representative cardinality when needed. Obtain
  approval first if this uses a linked or remote database.
- The implementer launches the app on an available simulator/emulator and verifies the complete
  flow with Argent when available: Explore shows the room grid, scrolling loads another cursor
  page without duplicate cards, pull-to-refresh resets traversal, tapping opens a read-only
  room, back returns to the grid, and a signed-out deep-link is rejected. Save screenshots or
  a recording as validation evidence. The user can then perform final visual acceptance.
- Gauge mini-render performance on a long grid; if it clearly lags, reopen the server-side thumbnail option (out of scope for v1).

## Risks / open points

| Risk | Level | Mitigation |
|---|---|---|
| Mini-render cost (~14 images/card) on long lists | Medium | `removeClippedSubviews` + `windowSize` in place; measure in Phase 5 before considering an upgrade |
| Pages shorter than `limit` due to empty-after-reconcile dropping | Low | Client advances through every newly received empty page one request at a time while `nextCursor` is non-null, including empty middle pages; tests cover initial-empty, populated→empty→populated, and terminal-empty outcomes |
| Pagination drift or tied timestamps → duplicate rooms | High | Planned mitigation: keyset cursor uses `(updated_at, id)` and is computed from raw DB rows before reconcile filtering; Phase 5 adds regression coverage |
| A not-yet-seen room is updated ahead of the cursor during traversal | Low | It appears on pull-to-refresh; the active traversal stays stable instead of injecting reordered data mid-scroll |
| Username handle grows beyond six digits | Low | `lpad(..., 6, '0')` is a minimum width, so uniqueness remains intact after `dancer-999999` |
| No username-editing screen yet | — | Out of scope for v1; noted for later |
