# Admin Panel — Dance Content Management Plan

Status: **planned, not implemented**. Decisions agreed in discussion on 2026-08-26;
reviewed against the codebase on 2026-08-26 (findings folded in below).
Follow-up to `plans/dance-moves-import.md` (tables created and imported; generated
types committed).

## Goal

Let admins manage the four imported tables from the existing admin panel
(`apps/admin`, react-admin 5 + MUI, backed by `/api/admin` on the Fastify server):

- `dance_genres` — full CRUD
- `music_tracks` — full CRUD
- `dance_moves` — full CRUD, including genre assignment and music selection
- `dance_move_genres` — **not** a standalone resource; managed inline as a
  multi-select on the dance-move form

## Agreed decisions

1. **Media input = URL paste + preview.** All media columns stay `TextInput`s the
   admin pastes URLs into (legacy Boogiz S3 URLs). Thumbnails render an image
   preview; `audio_url` gets an inline `<audio controls>` player. File upload
   (storage buckets, signed URLs) is a possible later phase.
2. **Publish rule: a published move requires `main_video_url`.** Enforced
   server-side on create and update (evaluated against the merged row, since a
   PATCH may flip status without resending the URL). Music and genres stay
   optional — the 9 imported published moves without music remain editable.
   Client-side form validation mirrors the rule for UX.
3. **Delete is allowed, with referential guardrails.** react-admin's default
   confirm flow. Deleting a move cascades its join rows (DB). Deleting a music
   track still referenced by moves fails at the DB (FK `no action`) — the server
   maps FK violation `23503` to **409 Conflict** with a clear message. Deleting a
   genre cascades join rows (moves just lose the tag).

## Existing conventions to follow

- Route protocol: react-admin **simple-rest** — `parseListQuery` +
  `contentRange` from `apps/server/src/lib/react-admin.ts`; list responses set the
  `Content-Range` header; `PUT` and `PATCH` share one handler.
- All admin routes inherit the `requireAdmin` preHandler added via
  `fastify.addHook` in `adminRoutes`; a sub-plugin registered inside that scope
  inherits the hook.
- Services follow `catalog-service.ts`: factory taking `(supabase, httpErrors)`,
  a `SORTABLE_COLUMNS` allowlist, sanitized `q` search
  (`q.replace(/[,%]/g, "").trim()` + `ilike`), typed rows from
  `Database["public"]["Tables"][...]["Row"]`.
- Zod schemas follow `catalog-schemas.ts`: `.strict()`, update = `.partial()` +
  "at least one field" refine, cross-field rules as `.refine`.
- Admin UI resources follow `src/resources/catalog/`: one folder per resource
  with `index.ts`, `*-list.tsx`, `*-create.tsx`, `*-edit.tsx`, shared
  `*-form.tsx`, plus focused tests.
- `updated_at` is **not** sent by admin writes — the conditional DB trigger
  stamps it (fires because the update doesn't set `updated_at` explicitly),
  while imported legacy timestamps stay intact on untouched rows.

## Wire DTOs (`packages/types/src/index.ts`)

Per the repo rule (DTOs that cross the wire live in `@bnewapp/types`, which
`apps/admin` already depends on):

```ts
export type DanceContentStatus = "draft" | "published";
export type AdminDanceGenre = Omit<Database["public"]["Tables"]["dance_genres"]["Row"], "status"> & {
  status: DanceContentStatus;
};
export type AdminMusicTrack = Omit<Database["public"]["Tables"]["music_tracks"]["Row"], "status"> & {
  status: DanceContentStatus;
};
export type AdminDanceMove = Omit<Database["public"]["Tables"]["dance_moves"]["Row"], "status"> & {
  status: DanceContentStatus;
  genre_ids: string[];
};
```

Generated `Row` types widen `status` to `string` (check constraints are invisible
to type generation), so each DTO narrows it back to the real union — matching the
precision `CatalogItemDTO` already has.

(The existing catalog resource keeps a local `CatalogRecord` in the admin app —
legacy precedent, not copied here.)

## Server work (`apps/server/src/modules/admin/`)

New files, mirroring the catalog split; routes go in a sub-plugin to keep
`routes.ts` from growing unbounded:

```
dance-content-schemas.ts   # Zod: params + create/update for all three resources
dance-genres-service.ts
music-tracks-service.ts
dance-moves-service.ts
dance-content-routes.ts    # registered from adminRoutes (inherits requireAdmin)
```

### Endpoints (all under `/api/admin`)

Standard simple-rest quintet per resource — `GET /<res>`, `GET /<res>/:id`,
`POST /<res>`, `PUT|PATCH /<res>/:id`, `DELETE /<res>/:id` — for:

| Resource path | Table | List filters |
|---|---|---|
| `dance-genres` | `dance_genres` | `q` (name), `status`, `id[]` |
| `music-tracks` | `music_tracks` | `q` (title, artist), `status`, `id[]` |
| `dance-moves` | `dance_moves` | `q` (title only — description deliberately excluded), `status`, `level`, `genre_id`, `music_id`, `id[]` |

### `getMany` support (`id[]` filter) — required, currently missing

react-admin's `ReferenceField`/`ReferenceInput` issue
`GET /<res>?filter={"id":[...]}` with **no range param**. The default range
`[0,24]` would truncate reference lookups. Rule: when `filter.id` is an array of
UUIDs, apply `.in("id", ids)`, **ignore range** (cap ids at 500), and return all
matches. Validate each id is a UUID; reject otherwise.

Implementation notes: still set the `Content-Range` header on the `id[]`
response (`getMany` ignores it, but the response shape stays uniform with
`getList`), and the 500-id cap **intentionally diverges** from
`MAX_LIST_PAGE_SIZE = 100` — that limit protects paged browsing, not batched
reference resolution.

### `dance_moves` composition

- **Read (list + get)**: single query with an embedded join —
  `select("<move columns>, dance_move_genres(genre_id)")` — then map the embed to
  `genre_ids: string[]`. Never expose the raw join rows.
- **Genre filter on list**: PostgREST filtered inner embeds also filter the
  embedded array, which would corrupt `genre_ids`. Use a **second aliased embed**
  for filtering: `filter:dance_move_genres!inner(genre_id)` +
  `.eq("filter.genre_id", genreId)`, keeping the unfiltered
  `dance_move_genres(genre_id)` embed for data. When the genre filter is active,
  each row also carries the aliased `filter: [...]` key — the DTO mapping must
  strip **both** embeds (`dance_move_genres` and `filter`), not just the first.
- **Filter extraction**: `level` arrives as a JSON **number** in the parsed
  filter, so the route can't reuse the catalog's `typeof filter.x === "string"`
  extraction pattern for it — add a number branch (or coerce via Zod).
  `music_id` is a server-only filter with no UI consumer in this phase (kept for
  future use); the UI exposes only `q`, status, level, and genre.
- **Write**: create/update accept `genre_ids?: string[]`. Service diffs against
  current join rows: insert added pairs, delete removed pairs (two statements —
  no transaction over PostgREST; acceptable for admin writes; FK errors map to
  400). `music_id` is validated by the FK; map `23503` on move writes to 400
  ("Unknown music track or genre").
- **Create atomicity guard**: the move row is inserted before its join rows, so
  a failing join insert would orphan a genre-less move while the client sees a
  400 (and a retry would duplicate it). Pre-validate `genre_ids` with a single
  `select id from dance_genres where id in (...)` before inserting the move and
  reject unknown ids up front; if the join insert still fails, compensate by
  deleting the just-created move row before throwing. (Update-path partial
  failure stays acceptable — the row already exists and a retry converges.)
  If the compensating delete itself fails, an orphan move remains — accepted,
  since pre-validation makes that path nearly unreachable. Tests must not
  assert stronger atomicity than this best-effort compensation provides.
- **Publish rule**: on create, reject `status: "published"` without
  `main_video_url`. On update, load the current row, merge the patch, and reject
  when the merged row is published without a `main_video_url`. Single error
  message shared between service and schema:
  `"A published move requires a main video URL"`. **Accepted risk**: the
  load-merge-check is not transactional — two concurrent PATCHes (one clearing
  the URL, one publishing) could yield a published move without a video. Fine
  for a low-concurrency admin tool; not worth a DB constraint in this phase.

### Delete semantics

- `dance-moves` / `dance-genres`: plain delete; join rows cascade at the DB.
- `music-tracks`: on FK violation `23503` →
  `httpErrors.conflict("Track is used by dance moves; detach or replace it first")`.

### Validation (Zod)

- Genre: `name` trim 1..120, `status` enum `draft|published`, `sort_order` int.
- Track: `title` trim 1..200, `artist` nullable trim, `audio_url` URL (required),
  `thumbnail_url` URL nullable, `status`, `sort_order` int.
- Move: `title` trim 1..200, `description` nullable, `level` int `>= 1`,
  `bpm` positive int nullable, all 8 media columns URL nullable
  (`thumbnail_url`, `main_video_url`, `pro_dancer_video_url`,
  `pro_dancer_image_url`, `dancer_tip_video_url`, `dancer_tip_image_url`,
  `presentation_video_url`, `film_yourself_video_url`), `music_id` UUID nullable,
  `genre_ids` UUID array (default `[]` on create), `status`, `sort_order` int.
- URL fields: `z.string().trim().url()`; empty string is invalid — the form maps
  cleared inputs to `null` (react-admin `parse`), never `""`, consistent with the
  import's empty-string normalization.
- Sortable-column allowlists (all include `id`, matching the catalog precedent):
  genres `id|name|status|sort_order|created_at|updated_at`; tracks
  `id|title|artist|status|sort_order|created_at|updated_at`; moves
  `id|title|level|status|sort_order|created_at|updated_at`. Default list sort:
  `sort_order ASC` (UI), fallback `created_at` (server, existing behavior).
  A non-allowlisted sort column silently falls back to `sort_order` rather than
  returning 400 (catalog precedent — `catalog-service.ts`); all three services
  behave the same way.

## Admin app work (`apps/admin/src/`)

### Resources

```
components/media-url-input.tsx   TextInput + preview (image / audio / open-link),
                                 shared by music-tracks and dance-moves forms
resources/dance-genres/   genre-list, genre-create, genre-edit, genre-form, index
resources/music-tracks/   track-list, track-create, track-edit, track-form, index
resources/dance-moves/    move-list, move-create, move-edit, move-form, index
```

`media-url-input` lives outside the resource folders because two resources
consume it from day one (audio player + thumbnail preview on the track form,
image previews + open-links on the move form).

- **Every `<Edit>` needs a `transform` that strips non-editable fields** —
  react-admin PUTs the *full record* (`id`, `legacy_id`, `created_at`,
  `updated_at`), which the `.strict()` update schemas reject with 400. Follow
  the catalog precedent (`catalog-edit.tsx`'s `transform={catalogEditableFields}`):
  each resource's `*-form.tsx` exports a pick-editable-fields transform; the
  dance-moves one keeps `genre_ids`. Without this, every edit fails at runtime
  while minimal-payload server tests still pass.

- **`dance-genres` list**: name, status, sort_order, updated_at; filters `q` +
  status. Form: name, status select, sort_order.
- **`music-tracks` list**: thumbnail preview cell, title, artist, status,
  sort_order; filters `q` + status. Form: title, artist, audio_url (with inline
  audio player when a valid URL is set), thumbnail_url (with image preview),
  status, sort_order.
- **`dance-moves` list**: thumbnail cell, title, level, status, genres as
  `ReferenceArrayField` chips (`genre_ids` → `dance-genres`), music as
  `ReferenceField` (`music_id` → `music-tracks`), sort_order. Filters: `q`,
  status, level (select 1–4), genre (`ReferenceInput` → `dance-genres`).
- **`dance-moves` form**: title, description (multiline), level, bpm, status,
  sort_order; genres via `ReferenceArrayInput` + `AutocompleteArrayInput`;
  music via `ReferenceInput` + `AutocompleteInput` (server `q` search;
  `allowEmpty` no longer exists in react-admin 5 — clearing yields `""`, so map
  it to `null` via `parse`, same pattern as the URL inputs); a "Media URLs"
  section of `media-url-input`s
  (thumbnail and image URLs show an image preview; video URLs show an "open"
  link only — no embedded video player). Client-side validate: status
  `published` requires main video URL (mirror of the server rule).
- **`app.tsx`**: three new `<Resource>` entries — `dance-moves`
  (`recordRepresentation="title"`), `dance-genres`
  (`recordRepresentation="name"`), `music-tracks`
  (`recordRepresentation="title"`) — with MUI icons.
- `q` filters on reference autocompletes map react-admin's search to the server's
  `filter.q` (default behavior of `ReferenceInput`, no custom code expected).

### Record types

Import `AdminDanceMove`, `AdminDanceGenre`, `AdminMusicTrack` from
`@bnewapp/types`; no local record redefinitions.

## Tests

- **Server** — `apps/server/tests/admin-dance-content.test.ts` (split further if
  it grows past ~400 lines), following `admin-catalog-routes.test.ts`:
  - 401 without token, 403 for non-admin, per resource.
  - List: `Content-Range` header, range/sort parsing, `q` + status filters,
    `id[]` filter ignores range, invalid query → 400.
  - Moves: `genre_ids` composed on list/get; genre filter returns complete
    `genre_ids` and leaks neither embed key (`dance_move_genres` / `filter` —
    the aliased-embed regression case); create with `genre_ids`
    writes join rows; create with an unknown genre id → 400 and **no move row
    persisted** (atomicity guard); update diffs join rows (add + remove in one
    call).
  - Publish rule: create published without main video → 400; PATCH flipping
    status to published on a row without main video → 400; PATCH that also sets
    the URL → 200.
  - Deletes: move delete OK; in-use track delete → 409; unused track delete →
    200; genre delete OK.
  - Supabase failure paths → 500 (per existing risk coverage style).
- **Admin** — focused Vitest tests in the existing catalog style: **RTL/jsdom is
  not installed in `apps/admin`** (the catalog tests call the component function
  and assert on props — see `catalog-edit.test.tsx`), and this phase does not add
  it. Keep testable logic in pure functions and unit-test those directly:
  - the edit `transform` strips server-managed fields (`id`, `legacy_id`,
    `created_at`, `updated_at`) and keeps `genre_ids` on moves;
  - publish validation (`status === "published"` requires main video URL) as a
    pure validator shared by the move form;
  - media-url-input preview switching as a pure `previewKind(url)` helper
    (image vs audio vs open-link) tested without rendering;
  - prop-assertion smoke tests per resource (e.g. `emptyWhileLoading`,
    `transform` wiring) if cheap.

## Out of scope (explicit)

- No mobile/user-facing read APIs (next phase per the import plan: cursor-paginated
  `GET /api/dance-moves` etc.).
- No file uploads / storage buckets for dance media.
- No dashboard content metrics (counts of moves/tracks/genres) — trivial to add
  later if wanted.
- No re-hosting of Boogiz S3 media.
- No DB schema changes — the migration from the import phase is sufficient.

## Execution order

1. DTOs in `packages/types/src/index.ts`.
2. Server: schemas → three services → `dance-content-routes.ts` → register in
   `adminRoutes`.
3. Server tests; run `corepack pnpm --filter @bnewapp/server test`.
4. Admin: resource folders → `app.tsx` registration → tests; run
   `corepack pnpm --filter @bnewapp/admin test` and `typecheck`.
5. Repo-wide `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`.
6. Manual verify against the dev server with the real imported data (browse,
   filter by genre, edit a move's genres/music, publish-rule rejection, in-use
   track delete → 409).

## Open questions

1. **Level upper bound** — real data is 1–4 only; the DB allows any `level >= 1`.
   Cap the form/schema at 4, or leave open-ended? (Plan assumes open-ended
   schema, form select shows 1–4 plus free entry.)
2. **Genre `status` semantics** — does a `draft` genre hide its moves in the
   future user-facing API, or only hide the genre tab? Doesn't block admin CRUD;
   flagging for the read-API phase.
