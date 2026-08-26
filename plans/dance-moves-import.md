# Dance Moves — Schema & Legacy Import Plan

Status: **planned, drafts written, DB not pushed**. Decisions below were agreed in
discussion on 2026-08-25 (music decision and schema trim revised the same day);
open questions at the bottom must be settled before running the import.

## Goal

Bring the Boogiz "dance moves" content library into b-new-app: users browse dance
moves (main video, pro dancer video, title, description, level, …) organized by
genre, and learn along with a music track. Set up the Postgres tables and import
the legacy data from the Boogiz MongoDB backup.

## Source data

Boogiz is MongoDB/Mongoose. Backup used:
`/Users/kb/Documents/works/magnus/boogiz-resource/backup/2026-06-17/boogiz-backup/boogiz`
(mongodump BSON; `bsondump` and `mongorestore` are available locally).

| Collection | Docs | Decision |
|---|---|---|
| `dancemoves` | 1,086 | Import all; `active` maps to `published`/`draft` |
| `dancegenres` | 28 | Import all |
| `musics` | 318 | **Import all (revised)** — see "Music" below |
| `featureddancers` | 27 | Skip (agreed) |
| `owneddancemoves` | 20,620 | Skip — legacy users don't exist here |

Reference schema files in the Boogiz repo:

- `boogiz-server/app/models/dance_move.js` — move schema (many Unity/gameplay fields)
- `boogiz-server/app/models/dance_genre.js` — genre schema (`name`, `key`, `weight`, `active`)
- `boogiz-rn/src/types/DanceMove.type.ts` — client shape
- Genre↔move relation is N-N, embedded as `danceGenre: [ObjectId]` on the move
  document (no join collection).

Findings from the actual backup data:

1. **181 of 1,186 genre links are orphans** — they point to genres deleted from
   `dancegenres`. As a result **149 moves end up with zero surviving genres, 32 of
   them active**. (Open question #2.)
2. Field coverage is uneven: `description` 813/1086, `musicId` 935/1086,
   `realPersonResizedLink` only 588/1086 → resized URLs need a fallback to the
   original link.
3. Legacy genre `key` values are dirty (emoji, spaces, `#tiktoktop`) and are **not
   imported**. Boogiz used `key` as a cross-reference identifier for battle-pass,
   tracking, and locale systems that do not exist in b-new-app; genre identity here
   is the `uuid` (+ `legacy_id` for import idempotency).
4. Many string fields contain `""` (e.g. `realPersonImage`) — normalize empty
   strings to `null` on import, **before** applying the resized-link fallback
   (a literal `resized ?? original` would keep `""` and never fall back).
5. `level` in the real data is only 1–4 (533/326/225/2). The check constraint is
   `level >= 1` with no upper bound.

## Music (revised decision)

Product intent: the user needs music **while learning along** with a move; recorded
final videos already get music merged during processing, so only the learn flow
needs a standalone track. Findings that drove the design:

- The Boogiz client always plays the learning video **muted** (except 2/1086 moves
  with `playLearningVideoMusicItself`) and loops a separate mp3 over it.
- Boogiz has three music fields (`musicId`, `learningVideoMusicId`,
  `internationalLearningVideoMusicId`) — implementation noise, not product
  structure. For 806/808 active moves they resolve to the **same song**; each move
  effectively has exactly one track.
- Music is heavily shared: 925 moves reference only **118 distinct songs** (max 45
  moves per song) → a proper table + FK, not denormalized columns.
- Future admin flow: upload music first, then pick a track when creating a move —
  confirms music as a standalone admin-managed entity.
- Resolution against the backup: **799/808 active moves resolve to an existing
  music doc** (all with non-empty `musicLink`); **9 active moves have every music
  ref pointing to deleted docs** (Warming up, NY-Bronx, 1-step, Flirty, Gully
  creeper, Spider, Temu a vi, Elbow swing, Wheelbarrow) → imported with
  `music_id = null` + warning. (Open question #3.)

Import resolution order per move: `internationalLearningVideoMusicId ??
learningVideoMusicId ?? musicId`, trying each candidate until one exists in the
legacy `musics` collection (prefer the learning variant because it is
tempo-matched to the learning video; prefer international over the Denmark-only
licensing variant).

## Agreed scope decisions

- **Lean content-only columns.** Drop Unity/gameplay legacy: `animationLink`,
  `points`, `rank`, `types` (power/expression/technique), `coin_cost` (a future
  paid-move feature should use the app's own Glow economy), `mirrored`,
  `hasHeadAnimationIssue`, `doNotShowInUnity`, `aiVideos`, `specialType`,
  `genre` (legacy string enum), `skillLevel`, `isMutedRealPerson`,
  `playLearningVideoMusicItself`, `featured_dancer_id`. On music tracks, drop
  `coin_cost`, `delayBeforeAvatarDance`, `genre`, `onlyForDenmark`.
- **Also dropped (2026-08-25 trim)**: genre `key` (served Boogiz-only systems,
  dirty values, and its `not null unique` constraint could bite future admin
  flows) and `moveType` (near-constant: `'on feet'` on 1,085/1,086 docs — zero
  signal; a future taxonomy should be defined by this product, not inherited).
- **Media URL columns are kept as a superset** even though the current product
  scope only needs thumbnail + main video + pro dancer video. Future direction
  relative to Boogiz is unknown; nullable text columns are inert and preserve the
  imported data, while the DTO/API layer exposes only the confirmed subset.
  "Clean" is enforced at the API surface, not by trimming inert columns.
- **Keep Boogiz S3 URLs as-is** (plain `text` columns). Media re-hosting to our own
  storage is a possible later migration.
- **One URL column per video type**, import prefers the `*ResizedLink` variant and
  falls back to the original link (after empty-string normalization).
- **One music per move** via `music_id` FK; no N-N music join table (YAGNI).
- No featured dancers.

## Schema design

Follows the existing `catalog_items` conventions: RLS enabled with **no client
policies** (all access via the server secret-key client), `status in
('draft','published')`, `sort_order`, reuse of the existing `public.set_updated_at()`
trigger function.

One new migration (`supabase/migrations/20260825192507_create_dance_moves.sql`)
creating four tables: `dance_genres`, `music_tracks`, `dance_moves`,
`dance_move_genres`.

Notable deviations from `catalog_items`, by design:

- **`legacy_id text unique`** on genres/tracks/moves — the import upserts on it so
  re-runs stay idempotent.
- **Conditional `set_updated_at` triggers** — fire only when the row actually
  changed AND the update did not explicitly set `updated_at`. This preserves
  imported legacy timestamps across idempotent re-runs (a plain trigger would
  clobber `updated_at` with `now()` on the UPDATE half of every upsert) while
  still stamping normal admin edits.

### `dance_genres`

`id uuid pk`, `legacy_id`, `name`, `status`, `sort_order` (from legacy `weight`),
timestamps. Index `(status, sort_order)`. No `key` column — see the trim decision
above.

### `music_tracks`

```sql
create table public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  title text not null,
  artist text,
  audio_url text not null,
  thumbnail_url text,
  status text not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint music_tracks_status_check check (status in ('draft', 'published'))
);
-- + (status, sort_order) index, RLS, conditional set_updated_at trigger
```

### `dance_moves`

Content columns (`title`, `description`, `level >= 1`, `bpm`, `thumbnail_url`,
six video/image URL columns), plus:

```sql
-- No cascade: a track in use must be detached or replaced before deletion.
music_id uuid references public.music_tracks (id),
```

`music_id` is nullable — 9 orphan moves, and the admin flow may create a move
before attaching a track. Index `(status, sort_order, created_at desc)` matches
the legacy list ordering.

### `dance_move_genres` (normalized N-N join)

`(dance_move_id, genre_id)` composite PK, both FKs `on delete cascade`, index on
`genre_id`.

## Field mapping (legacy → new)

| Legacy (`dancemoves`) | New column | Note |
|---|---|---|
| `_id` | `legacy_id` | upsert key |
| `name` | `title` | trimmed |
| `description` | `description` | `""` → null |
| `level` | `level` | default 1 when missing/invalid |
| `bpm` | `bpm` | absent from the backup (0/1,086) — always null; admin-filled later |
| `thumbnail` | `thumbnail_url` | |
| `learningResizedLink ?? learningLink` | `main_video_url` | resized preferred (see open question #1) |
| `realPersonResizedLink ?? realPersonLink` | `pro_dancer_video_url` | resized preferred |
| `realPersonImage` | `pro_dancer_image_url` | mostly `""` → null |
| `dancerTipResizedLink ?? dancerTipLink` | `dancer_tip_video_url` | |
| `dancerTipImage` | `dancer_tip_image_url` | |
| `presentationResizedLink ?? presentationLink` | `presentation_video_url` | |
| `filmYourSelfResizedLink ?? filmYourSelfLink` | `film_yourself_video_url` | |
| `intl ?? dk ?? musicId` (first existing) | `music_id` | resolved via `music_tracks.legacy_id` map; null + warning when unresolvable |
| `active` | `status` | true → `published`, else `draft` |
| `priority` | `sort_order` | |
| `createdAt` / `updatedAt` | `created_at` / `updated_at` | preserve legacy timestamps |
| `danceGenre: [ObjectId]` | rows in `dance_move_genres` | resolved via `legacy_id` maps |

Genres: `name`→`name`, `weight`→`sort_order`, `active`→`status` (`key` dropped).

Music tracks: `title`→`title`, `artist`→`artist`, `musicLink`→`audio_url`
(all 318 non-empty), `thumbnail`→`thumbnail_url`, `active`→`status`.

## Import script

`scripts/import-boogiz-dancemoves.mjs` — plain Node, **zero new dependencies**:

1. Shell out to `bsondump --quiet` for `dancegenres.bson`, `musics.bson`, and
   `dancemoves.bson`; parse MongoDB Extended JSON wrappers (`$oid`, `$date`,
   `$numberInt`, …) into plain values.
2. Apply the field mapping above (empty strings → null before URL fallbacks);
   resolve each move's music candidate.
3. Write through PostgREST with native `fetch` using the secret key — env loaded
   from `apps/server/.env` via `process.loadEnvFile` (`SUPABASE_URL`,
   `SUPABASE_SECRET_KEY`). No `@supabase/supabase-js` needed at the repo root.
4. Order: upsert `dance_genres` → upsert `music_tracks` → select the track
   `legacy_id → uuid` map → upsert `dance_moves` (with resolved `music_id`) →
   select genre/move maps → upsert `dance_move_genres`
   (`on_conflict=dance_move_id,genre_id`). Batches of 500 rows, all upserts
   `on_conflict=legacy_id` with `resolution=merge-duplicates`.
5. `--dry-run` flag parses, maps, and validates without writing. Validated against
   the real backup: **28 genres, 318 music tracks, 1,086 moves (925 resolved to a
   track), 1,005 valid genre links; 181 orphan genre links skipped; 161 moves
   without music (9 published).**

Fully idempotent: re-running upserts on `legacy_id`, creates no duplicates, and the
conditional triggers keep legacy timestamps intact.

## Execution order & approval gates

1. ~~Write the migration + import script~~ — done (drafts in the worktree).
2. **Approval gate**: `corepack pnpm db:push` (external state change — requires
   explicit approval per AGENTS.md). **Not yet approved/run.**
3. `corepack pnpm db:types` and commit `packages/types/src/database.generated.ts`.
4. Run the import for real; verify with count/spot-check queries.
5. Later phases (out of scope here): DTOs in `@bnewapp/types`, server routes
   (`GET /api/dance-genres`, `GET /api/dance-moves` with genre filter + cursor
   pagination — the cursor must include `id` as a tiebreaker since many rows share
   `sort_order = 0`), then the mobile feature per the atomic-split standard. The
   mobile learn player must replicate the learn-along behavior: play the learning
   video muted while looping the move's music track.

## Open questions (settle before running the import)

1. **Which legacy video is the "main video"?** Current mapping uses `learningLink`
   (present on 1086/1086). If product intent is the presentation/avatar video,
   switch to `presentationLink` (935/1086).
2. **32 active moves with zero surviving genres** — keep them `published` (visible
   only in an "All" listing) or demote to `draft` for admin re-categorization?
3. **9 active moves with no resolvable music** — keep `published` (learn flow
   without music) or demote to `draft` until a track is attached? Leaning `draft`,
   same treatment as #2, since learn-along without music is broken by design.
4. **Admin CRUD endpoints** for moves/genres/tracks in this phase (admin panel
   already exists), or DB + import only, with read APIs as the next phase?
