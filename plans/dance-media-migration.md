# Dance Media — Migration to Supabase Storage Plan

Status: **planned, script drafted, not yet run**. Decisions below were agreed in
discussion on 2026-08-26. Follow-up to `plans/dance-moves-import.md`, which imported
the rows but kept Boogiz S3 URLs as-is.

## Goal

Re-host all dance-content media (move videos/images, music audio/covers) from the
legacy Boogiz S3 buckets into our own Supabase Storage, and rewrite the URL columns
in `dance_moves` / `music_tracks` to point at the new public objects.

## Source data

All media URLs in the imported columns live on three legacy S3 buckets in
`eu-central-1`: `boogiz`, `boogiz-avatar`, `boogiz-music`. Measured from the backup
(2026-08-26):

- **~7,166 unique URLs** across the imported columns: ~5,127 videos (mp4/mov),
  ~1,721 images (jpg/png/jpeg), 318 mp3.
- HEAD sampling: images and mp3 100% alive; **~16% of sampled mp4 return 403**
  (deleted or private — indistinguishable without bucket-owner AWS access).
- Estimated total size ~11–12 GB (videos avg ~2 MB, mp3 ~1.7 MB, images ~0.09 MB).

## Agreed decisions

- **Destination: Supabase Storage**, one **public bucket `dance-media`** per
  environment (same policy model as the existing `catalog-art` bucket). No new
  vendor; switching to R2/CDN later is a bulk copy + URL rewrite since the DB only
  stores absolute URLs.
- **Dead files keep their legacy URL** in the DB and are listed in the run report;
  admins replace them over time through the admin panel. No demotion to `draft` in
  this phase.
- **No local media archive** (saves ~12 GB disk): the script streams each file
  through memory (download → upload → release). After the staging run, the staging
  bucket itself is the durable archive, no longer dependent on legacy S3.
- **No transcoding/HLS** — legacy clients play progressive mp4 directly; mobile
  will do the same. `legacy_id` + the report keep everything traceable for a later
  processing pass.
- **Per-env self-contained content** (no shared content DB across envs): future
  user-scoped tables will FK `dance_moves.id`, and env isolation must hold. Prod
  setup = re-run the importer (idempotent on `legacy_id`) + re-run this media
  script with the **staging bucket as the source host**, so prod never depends on
  legacy S3.

## Bucket layout

One bucket, organized by entity (not by media type — the policy is identical and
debugging thinks in "assets of move X"). Object names map 1-1 to DB columns;
extension is taken from the source URL:

```
dance-media/
  moves/<legacy_id>/
    thumbnail.<ext>          ← thumbnail_url
    main.<ext>               ← main_video_url
    pro-dancer.<ext>         ← pro_dancer_video_url
    pro-dancer-image.<ext>   ← pro_dancer_image_url
    dancer-tip.<ext>         ← dancer_tip_video_url
    dancer-tip-image.<ext>   ← dancer_tip_image_url
    presentation.<ext>       ← presentation_video_url
    film-yourself.<ext>      ← film_yourself_video_url
  tracks/<legacy_id>/
    audio.<ext>              ← audio_url
    cover.<ext>              ← thumbnail_url
```

- Rows without a `legacy_id` (future admin-created content) use the row `id`.
- Legacy files shared by several fields are duplicated per field — a few hundred
  MB total, accepted for clean semantics.
- Migration objects are effectively immutable (`cache-control: max-age=31536000`,
  fixed names). Future admin **replacement** uploads must use a fresh object name
  (e.g. timestamp/hash suffix, as `catalog-art` does) instead of overwriting a
  path, because the public CDN caches aggressively.

## Migration script

`scripts/migrate-dance-media.mjs` — plain Node, zero new dependencies, same
conventions as `import-boogiz-dancemoves.mjs` (native `fetch` against PostgREST +
Storage API, env from `apps/server/.env` via `process.loadEnvFile`).

Pipeline:

1. **Work list from the DB, not from Mongo** — the DB is the source of truth after
   import. Select the media columns of `dance_moves` and `music_tracks`; a field is
   pending iff its URL host matches the source host (default `amazonaws.com`,
   overridable with `--source-host` — prod runs will pass the staging Supabase
   host).
2. Group pending fields by **source URL** (download once, upload to each target).
3. Per group: download into memory (120 s timeout) → for each target, upload to
   the deterministic path unless an object with the same byte size already exists
   → `PATCH` the row's field to the new public URL.
4. `--dry-run` builds and summarizes the work list without touching storage or DB.

Resume semantics (crash-safe, no state file):

- **The DB is the progress ledger**: the `PATCH` is the per-field commit, executed
  only after a successful upload. A re-run rebuilds the work list from URLs still
  on the legacy host, so completed fields are skipped automatically.
- If a crash lands between upload and DB update, the re-run finds the object on
  the bucket (HEAD public URL + size match) and only redoes the cheap `PATCH`.
- The `PATCH` filters on `field=eq.<old URL>` in addition to `id`, so a value an
  admin changed mid-run is never clobbered (counted as "stale" in the report).

Failure handling:

- A single failing file never aborts the run: the group is recorded with its
  reason and the run continues. Re-running retries only the failed files.
- Transient errors (network, 429, 5xx) retry up to 3 attempts with backoff;
  403/404 are permanent → reported, legacy URL stays in place.
- Concurrency: 6 groups in flight (peak memory a few × avg 2 MB).
- The bucket is created (public) on first run if missing; a pre-existing
  non-public `dance-media` bucket is a hard error.

Report printed at the end of every run: fields migrated, objects uploaded vs
already present, stale fields, and every failure as
`table.field legacy_id=… <url> — <reason>`.

## Execution order & approval gates

1. ~~Write the script~~ — done (draft in the worktree).
2. `node scripts/migrate-dance-media.mjs --dry-run` — read-only sanity check of
   the pending work list against staging.
3. **Approval gate**: real run against staging (external state change: creates the
   bucket, uploads ~12 GB, rewrites URL columns). Expect one long run; safe to
   interrupt/re-run.
4. Verify (see below), then commit the report summary into this plan.
5. Prod (later): run the importer against prod, then this script with
   `--source-host <staging supabase host>`.

## Verification after the real run

- `select count(*)` of remaining legacy-host URLs per column — should equal the
  reported permanent failures, nothing else.
- Spot-check playback: a migrated `main` video, an mp3, and a thumbnail via their
  new public URLs (mobile is not wired to this content yet, so URL-level checks
  suffice).
- Storage dashboard: object count ≈ unique URLs minus permanent failures (plus
  shared-URL duplicates).

## Open items

- Whether the ~16% dead mp4s are recoverable requires access to the Boogiz AWS
  account (403 hides deleted vs private). Unresolved; the report gives the exact
  list to chase.
- Admin-panel upload of dance media (replacing dead files, new content) is a
  separate follow-up; it must follow the fresh-object-name rule above.
