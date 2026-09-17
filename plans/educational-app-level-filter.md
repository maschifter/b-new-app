# Stepz — Feed Level Filter

Status: **implemented 2026-09-17** (server side; §3's client constant is F1's). Written
against `d481648`; every file and line reference below was checked against the working tree.
Line numbers in §1–§2 describe the code *before* this phase — each cited anchor shifted by one
or two lines once the filter landed.

**This file is the whole plan and it stands alone.** One query parameter on one existing
endpoint. No migration, no new route, no DTO, no client change, no `db:push` approval, no
device run. Server TypeScript under Vitest.

## 0. Scope record — why this is not the "catalog reach" plan

An earlier draft of this file paired the level filter with a second capability,
`GET /api/dance/catalog-summary`, to supply the profile's denominators — "45 of 800 moves
learned" and "learned / total" per style.

**That capability was cut on 2026-09-17 by the product owner**, and the reason is recorded here
so nobody re-adds it by reflex:

- The project brief (`Educational app.md:22` in `D:\works\magnus\b-new-app\docs\educational`)
  enumerates this app's server connections as exactly two — "get list of dance moves from the
  API" and "talk to scanning server to get score" — beneath "Everything is fully on the user's
  device" (`:20`).
- `README.md:60` would have permitted it ("Catalog fetching and scan scoring remain the allowed
  server connections"), and a summary endpoint is catalog fetching rather than profile sync. So
  the endpoint was *allowed*. It was cut because it is not *wanted*: the app teaches one dance
  move at a time, and a catalog-wide denominator is not part of that.

**Consequences, which later phases must honour rather than rediscover:**

- The profile shows `learnedMoveCount` alone — "45 moves learned", and a per-style count of
  learned moves. **No "of 800", no per-style total.** F3 in
  `plans/educational-app-features.md:507` and `:509` has been updated to match.
- That plan's §3.5 (`catalogMoveCount` must use the feed's eligibility predicate) is moot —
  there is no `catalogMoveCount`.
- Its §3.6 decision ("make the option list data-driven") is **reversed**; see §3 below.
- Every number on the profile is now computed on the device from the local collection
  (`plans/educational-app-collection.md`). The profile makes no network call at all, which
  settles the offline requirement at `plans/educational-app-features.md:517` for free.

If a catalog-wide count is ever wanted again, that is a fresh product decision, not a detail to
resolve inside an implementation phase.

---

## 1. What this phase adds

One capability: an optional `level` filter on `GET /api/dance/moves`.

`dance_moves.level` exists — `integer not null default 1`, constrained only by
`dance_moves_level_check check (level >= 1)`
(`supabase/migrations/20260825192507_create_dance_moves.sql:65`, `:83-84`) — but the consumer
query has no way to select on it. Document 01 §2 requires a Level filter on the feed
(`plans/educational-app-features.md:463`).

This sits squarely inside the brief's first allowed connection: a parameter on "get list of
dance moves from the API", not a new server surface.

### What already exists

- `GET /api/dance/moves` (`apps/server/src/modules/dance/routes.ts:41`) → `listMoves`
  (`service.ts:243`), keyset cursor over `(sort_order, created_at, id)`, optional `genre_id`.
- The eligibility predicate `.eq("status", "published").not("film_yourself_video_url", "is",
  null)` at `service.ts:252-253`. Unchanged here — the new filter narrows within it.
- `dance_moves_status_sort_order_idx (status, sort_order, created_at desc)` drives the ordering;
  `level` filters within it.

---

## 2. The change

Three files, plus their tests. **`packages/types` is untouched** — a query parameter is not a
DTO, and `DanceMovesPage` does not change.

```text
apps/server/src/modules/dance/schemas.ts   # + level on DanceMovesQuery
apps/server/src/modules/dance/service.ts   # + level in listMoves
apps/server/src/modules/dance/routes.ts    # + level pass-through
apps/server/tests/dance-routes.test.ts     # + the cases in §4
```

`schemas.ts`, on `DanceMovesQuery` (`:32-36`):

```ts
export const DanceMovesQuery = z.object({
  genre_id: z.string().uuid().optional(),
  level: z.coerce.number().int().positive().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
```

`.positive()` mirrors `dance_moves_level_check`, so a query the database could never satisfy is
rejected at the boundary with a 400 instead of returning a confusing empty page.

**The admin list already does this**, at
`apps/server/src/modules/admin/dance-moves-service.ts:151` — `if (options.level !== undefined)
query = query.eq("level", options.level)`. Match that shape rather than inventing another. Do
not share code across the two modules: the admin service has its own filters, ordering and DTO,
and the consumer route's eligibility predicate is exactly what the admin list must *not* apply.

`service.ts`, in `listMoves`, beside the genre filter at `:259`:

```ts
if (options.level !== undefined) query = query.eq("level", options.level);
```

`routes.ts`, in the `/moves` handler (`:53-57`), following the existing
`exactOptionalPropertyTypes` spread:

```ts
const page = await dance.listMoves({
  limit: query.data.limit,
  ...(query.data.genre_id === undefined ? {} : { genreId: query.data.genre_id }),
  ...(query.data.level === undefined ? {} : { level: query.data.level }),
  ...(cursor === undefined ? {} : { cursor }),
});
```

**The filter must compose with the cursor, and that is the risky part.** `listMoves` applies the
keyset window through `.or(cursorFilter(...))` (`:260`), which PostgREST ANDs with the other
filters. A level filter that displaced the cursor would drop the keyset window: every request
would return the same first page with a non-null `nextCursor`, and the feed would scroll forever
over the same moves. Displaced the other way round, the level filter would stop applying and the
feed would silently page the unfiltered catalog. §4 covers `level` + `genre_id` + `cursor` as a
single case for exactly this reason.

**No index.** The existing composite index still drives the ordering and `level` filters within
it. At catalog scale this is not worth a migration, and adding one would cost this phase its
"no `db:push`" property.

---

## 3. Where the filter's options come from — F1's decision, with the trade named

The server can filter by level. It does **not** tell the client which levels exist, because the
endpoint that would have enumerated them is cut (§0). `dance_moves.level` has a floor and no
ceiling, so there is nothing in the schema to enumerate either.

**Default: hardcode the option list to the levels the product ships (1, 2, 3), as one named
constant in the feed feature.** Documents 01 and 03 both assume exactly these three.

**The cost, stated plainly so it stays a choice and not an accident:** if an admin ever files a
move at level 4, that move is unreachable *through the Level filter*. It remains reachable
through "All Levels" and through the style filter, so this degrades discovery rather than hiding
content. The reverse case — a shipped level with no eligible moves — renders an option that
returns "No moves found", which is cosmetic, not a correctness fault.

**Revisit trigger:** the first time the catalog contains a level outside the constant. The
catalog is admin-managed, so that is an operational fact someone observes rather than a silent
failure. Fixing it then is a one-line constant change, or a fresh decision to add an enumeration
endpoint.

F1 owns this, since the option list is client UI. This phase only guarantees that whatever value
F1 sends is filtered correctly server-side.

---

## 4. Acceptance

Vitest cases added to `apps/server/tests/dance-routes.test.ts`, using its existing harness:
`registerDance` for the fake Fastify instance and `queryBuilder`
(`apps/server/tests/helpers/supabase.ts`) for the chainable Supabase mock.

- [ ] `level=2` reaches Supabase as `.eq("level", 2)`.
- [ ] `level`, `genre_id` and `cursor` **together** each reach the query — `.eq("level", ...)`,
      `.eq("matching_genres.genre_id", ...)` and `.or(...sort_order.gt...)` — in one request.
      The named guard against an infinite feed (§2).
- [ ] `level=0`, `level=-1` and `level=abc` are each rejected with 400 `"Invalid dance moves
      query"` before Supabase is touched (`expect(from).not.toHaveBeenCalled()`).
- [ ] Omitting `level` sends no level filter; existing paging behavior is unchanged.
- [ ] The eligibility predicate still applies alongside the level filter — `.eq("status",
      "published")` and `.not("film_yourself_video_url", "is", null)` are both on the query.

Authentication needs no new case: `/moves` is already covered by
`"requires authentication for catalog reads"` (`dance-routes.test.ts:88`), and this phase adds
no route.

---

## 5. Validation

```sh
corepack pnpm --filter @bnewapp/server typecheck
corepack pnpm --filter @bnewapp/server test
corepack pnpm lint
```

No Turbo build is needed: `packages/types` is untouched. No manual Supabase call is needed
either — the dropped summary endpoint was the only part that rested on PostgREST behavior a
mocked test cannot observe.

`@bnewapp/admin`'s test task fails on a missing `apps/admin/.env.local` in this environment;
pre-existing, recorded under P0 in `plans/educational-app.md:1161`, and not this phase's
business.

---

## 6. Explicitly not in this phase

- **`GET /api/dance/catalog-summary`** — cut, see §0. Not deferred: cut.
- **Any client change.** No `level` parameter on the mobile side, no filter UI. Note for
  whoever writes F1: `getDanceMoves` lives in **`@bnewapp/dance-flow`**
  (`packages/dance-flow/src/api.ts:32`), a package both apps share — so where Stepz's level
  filter belongs (that shared package, or a Stepz-local feature `api.ts` per `CLAUDE.md` §6) is
  F1's decision to take, not a detail to settle by reflex. `apps/mobile` passes no `level`
  today and is unaffected either way.
- **`GET /api/dance/moves/by-ids`** — the batch lookup for locally-stored move ids. Same layer,
  different concern, its own plan (S2 in `plans/educational-app-features.md`).
- **Shuffled feed order.** Still deterministic; still open decision 6 in that plan's §8.
- **The retention backstop and the per-owner post rate limit** (S3). Unrelated to reads.
- **An index on `level`.** A real lever with a named trigger; no evidence behind it today.
