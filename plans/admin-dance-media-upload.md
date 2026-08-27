# Admin Dance Media — Direct Upload Plan

Status: **planned, not started**. Follow-up to `plans/dance-media-migration.md` (open
item: "Admin-panel upload of dance media"). Written 2026-08-26; reviewed against the
codebase 2026-08-26 (all file/line references verified; review changes: image-endpoint
metadata moved to query params, Safari HEVC residual gap made explicit, oversize-image
server tests added, bucket-config create-vs-update split clarified).

## Goal

Let admins upload video/image/audio files for `dance_moves` and `music_tracks`
directly from the admin panel, instead of pasting URLs. Uploaded files land in the
existing public `dance-media` bucket; the record keeps storing a plain absolute URL,
so the rest of the system (mobile, migration script, prod bootstrap) is unchanged.

## Current state

- Admin CRUD is complete but URL-only:
  - Server: `apps/server/src/modules/admin/dance-content-routes.ts` +
    `dance-content-schemas.ts` — every media field is `z.string().trim().url()`
    (nullable except `music_tracks.audio_url`). Published moves require
    `main_video_url`.
  - Client: `apps/admin/src/components/media-url-input.tsx` — TextInput + preview
    (image/audio only, no video preview), used by
    `resources/dance-moves/move-form.tsx` (8 fields) and
    `resources/music-tracks/track-form.tsx` (2 fields).
- Only upload precedent: `POST /api/admin/catalog/:id/art`
  (`apps/server/src/modules/admin/catalog-service.ts:154`) — multipart through the
  server, `@fastify/multipart` capped at **5 MiB** (`apps/server/src/app.ts:44-46`),
  sharp → webp, hash-named object in `catalog-art`, `upsert: false`.
- `dance-media` bucket exists on staging (created by the migration script), public,
  layout `moves/<legacy_id|id>/<field-name>.<ext>` / `tracks/<...>`.
- Supabase project global "Upload file size limit" was raised to ~250 MB for the
  migration; it applies per object to every upload path including signed uploads.

## Key decision — two upload paths, split by media kind

Every upload — on Create or on Edit — is a **brand-new file** producing a brand-new
object; existing objects are never mutated (CDN rule, see naming below). Because
new files come from admin machines (phone videos can be hundreds of MB, camera
photos 5–10 MB), size normalization/limits apply at upload time and legacy-file
statistics are irrelevant.

**Videos & audio → signed upload URLs.** Dance videos are large (legacy outliers up
to ~190 MB); buffering them through the Fastify server on Railway is a real
memory/timeout risk. The server never touches the bytes: it issues a **signed
upload URL** (`supabase.storage.from("dance-media").createSignedUploadUrl(path)`)
after validating what is being uploaded, and the admin browser uploads straight to
Supabase Storage (`uploadToSignedUrl`). No transcoding in this phase (consistent
with the migration decision; legacy clients play progressive mp4 as-is) — a
background transcode worker (ffmpeg / Cloudflare Stream / Mux) is a separate
follow-up if egress or playback size ever becomes a problem.

For video, **mobile start-up delay is governed by bitrate, not total file size**:
players stream via HTTP range requests, so a 100 MB 1080p/5 Mbps file starts
instantly while a 40 MB 4K/50 Mbps phone recording stutters on 4G. The real quality
gate is therefore a client-side **bitrate guard** (see limits table); the size cap
is only an accident stop.

**Images → server-proxied multipart + sharp.** Image inputs are small enough to
proxy, and server-side processing is the only way to guarantee a normalized output.
Reuse the `catalog-art` approach (`apps/server/src/modules/catalog/art.ts`): accept
png/jpeg/webp, auto-rotate, resize, encode webp q80. Two output tiers, because
thumbnails render in mobile grids/lists where 1600 px is wasted weight:

- **thumbnail tier — max edge 800 px** (~50–100 KB webp): `dance_moves.thumbnail_url`,
  `music_tracks.thumbnail_url` (cover).
- **detail tier — max edge 1600 px** (~150–300 KB webp): `pro_dancer_image_url`,
  `dancer_tip_image_url`.

(`catalog-art` itself stays as-is; its hitbox computation is catalog-specific.)

**Audio is not re-encoded** — mp3/m4a are already compressed; re-encoding only
loses quality. Only a size cap applies.

### Size / quality limits

| Kind  | Compression                          | Client pre-check                          | Enforced cap                                    |
| ----- | ------------------------------------ | ----------------------------------------- | ----------------------------------------------- |
| Image | sharp → webp q80, 800 px or 1600 px  | input ≤ 10 MB                             | per-request multipart `fileSize` (10 MiB)       |
| Video | none (phase 1)                       | ≤ 100 MB **and bitrate ≤ 8 Mbps**         | bucket `file_size_limit` (100 MiB) + project cap |
| Audio | none (already compressed)            | ≤ 20 MB                                   | client-side only (100 MiB bucket cap as backstop) |

A Supabase bucket has exactly **one** `file_size_limit`, so it is set to the video
maximum (100 MiB). The tighter audio (20 MB) and image (10 MB) caps have no
storage-level enforcement on the signed path — the audio cap is client-side only,
which is accepted for an admin-only tool; the image cap is enforced by the
server route's multipart limit.

The video bitrate guard is cheap and needs no server work: load the picked file
into a hidden `<video>` element, read `duration` from metadata, compute
`(size * 8) / duration` (bits per second — the ×8 matters, `size / duration` is
bytes/s and would make the guard 8× too permissive); above 8 Mbps, reject with an
actionable message ("export at 1080p H.264 ~5 Mbps and retry"). If metadata never
loads within a timeout, reject with the same export-H.264 message rather than
letting the file through unmeasured. Note the timeout branch is
browser-dependent and is NOT the HEVC defense: Chrome cannot demux HEVC so it
times out there, but Safari plays HEVC natively and would pass such a file
through the guard — which is why `.mov` (the iPhone HEVC default container) is
rejected at the extension level instead (see the ticket endpoint). The timeout
branch remains as a catch-all for otherwise unreadable files (e.g. HEVC bytes
renamed to `.mp4`) — **on Chrome only**. Accepted residual gap: on Safari an
HEVC-encoded `.mp4` demuxes natively, metadata loads, the file passes the guard
and uploads — then fails on older Android devices. There is no cheap
browser-side codec check; the mitigation is the "export H.264" admin guidance.
Do not file this as a bug during Safari QA. A correctly exported dance clip
(15–60 s at
5–6 Mbps ≈ 4–45 MB) never approaches the 100 MB cap — the cap only stops accidents
(raw 4K camera files). The bucket-level `file_size_limit` on `dance-media` is the
backstop that holds even if the UI is bypassed; the project-wide upload limit
(~250 MB) stays as the outer bound.

Known caveat, accepted for phase 1: phone recordings often place the mp4 `moov`
atom at the end of the file, costing the player an extra range round-trip before
playback starts. Supabase serves range requests so this is minor; a true fix
(faststart remux) belongs to the transcode follow-up.

Rejected alternatives: streaming videos through Fastify (backpressure, Railway
request timeouts, double bandwidth for no authorization benefit — the token flow
already restricts uploads to a server-chosen path), and browser-side video
compression (WebCodecs is slow and complex for an internal tool).

## Object naming — fresh names, CDN-safe

Migration objects use fixed names (`moves/<id>/main.mp4`) and are treated as
immutable behind the CDN (`cache-control: max-age=31536000`). Admin uploads must
therefore **never overwrite an existing path**. Server builds the path; the client
never chooses it:

```
<prefix>/<recordId | uuid>/<field-slug>-<unix-ms>.<ext>
   moves/9b2f.../main-1756224000000.mp4
  tracks/4c1a.../audio-1756224000000.mp3
```

- `prefix`/`field-slug` come from the same field map the migration script uses
  (`main_video_url` → `main`, `thumbnail_url` → `thumbnail` / `cover`, …).
- `recordId` when uploading from an Edit form; a server-generated `crypto.randomUUID()`
  when uploading from a Create form (the row id does not exist yet). The folder
  prefix is a debugging aid, not a contract — the mismatch on created rows is
  accepted (same as the plan's "rows without legacy_id use the row id" being only a
  convention).
- The timestamp suffix satisfies the fresh-object-name rule from
  `plans/dance-media-migration.md`; replaced objects are left in place (storage is
  cheap, old URLs may still be cached/linked). No deletion in this phase.

## Server changes (`apps/server`)

Two new routes in the admin module (both inherit the existing `requireAdmin` hook).

### 1. Video/audio ticket endpoint

`POST /api/admin/dance-media/uploads` → `ApiSuccess<DanceMediaUploadTicket>`

Request (Zod, `.strict()`):

```ts
{
  target: "move" | "track",
  field:  string,          // must be a VIDEO or AUDIO column of the target table
  recordId?: uuid,         // present when editing an existing row
  filename: string,        // used only to derive + validate the extension
}
```

Handler:

1. Validate `field` belongs to `target` and is a video/audio field (moves: the 5
   video columns — `main_video_url`, `pro_dancer_video_url`, `dancer_tip_video_url`,
   `presentation_video_url`, `film_yourself_video_url`; tracks: `audio_url`). Image
   fields are rejected here — they go through the image endpoint below.
2. Derive the extension from `filename` (lowercase it first — `.MP4`/`.Mov` must
   behave like their lowercase forms) and validate it against the field's kind:
   - video fields → `mp4` **only**. `webm` is excluded (iOS AVPlayer cannot play
     it, so allowing it would break the published-move playback guarantee).
     `mov` is also excluded: it is the default container for iPhone HEVC
     recordings, and the client bitrate guard cannot reliably catch HEVC —
     Safari plays it natively, so on Safari the metadata loads fine, the file
     passes the guard, and then fails on older Android devices. Rejecting the
     extension server-side is the only cheap, browser-independent stop. Legacy
     `.mov` objects migrated from Bubble keep working as plain URLs (ExoPlayer's
     Mp4Extractor handles most QuickTime files); the admin guidance is
     "export H.264 mp4".
   - audio fields → `mp3`, `m4a`
   Reject anything else with 400. Content type is derived server-side from the same
   extension map the migration script uses (plus `m4a`). m4a is mime-ambiguous
   (`audio/mp4` vs `audio/x-m4a` vs `audio/m4a`) — pin **`audio/mp4`** everywhere:
   the ticket's `contentType`, the client's `uploadToSignedUrl` header, and the
   bucket `allowed_mime_types` entry must be the exact same string or valid
   uploads will be rejected by the bucket policy.
3. Build the object path per the naming scheme above. When `recordId` is present
   (Edit form), `.select("id")` the target row first and 404 if it does not exist —
   not a security control (the path is server-chosen either way), just a friendlier
   error than uploading into a folder for a row that was deleted mid-edit.
4. Ensure the bucket exists (public `createBucket`, ignore "already exists" — same
   semantics as the migration script; keeps fresh environments working). Bucket
   creation sets the single `file_size_limit` (100 MiB) and `allowed_mime_types`
   so fresh environments match the staging bucket config. Note these are **two
   different operations**: `createBucket`-with-config only applies to fresh
   environments; on staging the bucket already exists, so `createBucket` is a
   no-op there and the config only arrives via the `updateBucket` approval gate
   (execution order step 5). Until step 5 runs, a fresh-environment bucket and
   the staging bucket diverge — do not defer step 5 past shipping the client.
5. `createSignedUploadUrl(path)` and return:

```ts
type DanceMediaUploadTicket = {
  path: string;
  token: string;
  publicUrl: string;    // storage/v1/object/public/dance-media/<path>
  contentType: string;  // client must send exactly this
};
```

### 2. Image upload endpoint (multipart, server-processed)

`POST /api/admin/dance-media/images` → `ApiSuccess<{ publicUrl: string }>`

Multipart request carrying **only the file**; `target`, `field`, `recordId?` travel
as **query params** (Zod-validated), not multipart form fields. Rationale: the
cited precedent (`POST /api/admin/catalog/:id/art`, `routes.ts:114`) also keeps its
parameter out of the body (URL segment) and reads only the file. Form fields with
`request.file()` are order-dependent — fields serialized after the file part are
not populated on `file.fields` until the file stream is consumed. Browsers keep
`FormData` insertion order so it can be made to work, but query params remove the
hazard entirely:

1. Validate `field` is an image column of `target` (moves: `thumbnail_url`,
   `pro_dancer_image_url`, `dancer_tip_image_url`; tracks: `thumbnail_url`).
2. `await file.toBuffer()` and run a sharp pipeline shared with (but separate from)
   `processCatalogArt`: validate png/jpeg/webp input, auto-rotate, resize to the
   field's tier (800 px for `thumbnail_url`/cover, 1600 px for
   `pro_dancer_image_url`/`dancer_tip_image_url`), encode webp q80.
   Invalid/oversized-pixel input → 400.
3. Upload the processed bytes to the fresh object path (extension is always
   `.webp`), `contentType: "image/webp"`, `cacheControl: "31536000, immutable"`,
   `upsert: false`.
4. Return the public URL.

The global multipart limit in `apps/server/src/app.ts:44-46` stays at 5 MiB; this
route reads its file with a **per-request limit** instead —
`request.file({ limits: { fileSize: 10 * 1024 * 1024 } })` — so `catalog-art`'s
cap is untouched and the change stays local to the new endpoint.

Legacy `gif` thumbnails keep working as plain URLs; new gif uploads are not
accepted (sharp→webp normalization would drop animation semantics silently —
revisit only if admins actually need animated thumbnails).

No changes to the existing CRUD routes: the client saves the returned `publicUrl`
into the normal URL field, and `nullableUrl` / `z.string().url()` already accept it.
The published-move-requires-main-video rule keeps working unchanged.

Hardening notes:

- The signed token authorizes exactly one server-chosen path, expires (default 2 h),
  and `upsert` stays false — an admin token can never overwrite existing objects.
- The ticket's `contentType` is advisory only — nothing in a signed upload forces
  the client to send it. The real enforcement is bucket-level `allowed_mime_types`,
  so setting it (together with `file_size_limit`) on `dance-media` is part of the
  bucket-config approval gate, not a nice-to-have. The exact list:
  `["video/mp4", "audio/mpeg", "audio/mp4", "image/webp"]` — `image/webp` is
  required because bucket restrictions apply to **all** uploads including the
  service-key writes from the image endpoint, not just the signed path. The
  restriction only applies to new uploads; already-stored legacy objects
  (`video/quicktime`, `image/gif`, `image/jpeg`, `image/png`) keep serving — but
  see the backfill-ordering constraint in the cache-control section.
- Per-object size is already capped by the project-wide upload limit (~250 MB).

## Shared types (`packages/types`)

Add `DanceMediaUploadTicket` and the request body type next to the existing
`AdminDanceMove` / `AdminMusicTrack` DTOs. The admin app must consume these instead
of redefining shapes.

## Admin client changes (`apps/admin`)

1. **`MediaPreview`**: add a `"video"` kind (`<video controls preload="metadata">`),
   since 5 of the 8 move fields are videos and today only image/audio preview exists.
2. **New `MediaUploadInput`** (wraps the existing `MediaUrlInput`):
   - Keeps the URL TextInput — pasting an external URL must keep working (dead-file
     replacement workflow may reference files hosted elsewhere; migration re-runs
     rely on URL semantics).
   - Adds a file picker with a per-kind `accept` list (video is `.mp4`/`video/mp4`
     only, mirroring the server allow-list), a client-side size pre-check
     (image 10 MB / video 100 MB / audio 20 MB) plus the **video bitrate guard**
     (hidden `<video>` → `duration` → `(size * 8) / duration`; > 8 Mbps — or
     metadata unreadable within a timeout — rejected with an actionable message),
     an upload progress state, and error surface (same UX shape as
     `catalog-art-upload.tsx`). The guard's decision logic (size pre-check,
     bits-per-second math, threshold, metadata-timeout branch) lives in a pure
     function separate from the DOM plumbing so it is unit-testable.
   - Upload flow branches by kind:
     - **video/audio**: `POST /api/admin/dance-media/uploads` (via the existing
       `authenticatedFetch`) → `supabase.storage.from("dance-media")
       .uploadToSignedUrl(path, token, file, { contentType, cacheControl: "31536000, immutable" })`
       using the admin app's existing Supabase client → set the form value to
       `publicUrl`. (The SDK formats the header as `max-age=<cacheControl>`, so the
       `immutable` directive must ride inside the string — same trick as
       `uploadArt` in `catalog-service.ts:163`.)
     - **image**: FormData (file only) `POST
       /api/admin/dance-media/images?target=…&field=…&recordId=…` → set the form
       value to the returned `publicUrl` (server already compressed to webp).
   - Works on both Create and Edit forms (no record id required — see naming).
     Either flow always produces a new object; the previous URL/object is left
     untouched until the form is saved.
3. Swap `MediaUrlInput` → `MediaUploadInput` in `move-form.tsx` (8 fields, each with
   the right kind) and `track-form.tsx` (audio + cover).

Failure modes to handle in the component: ticket request 4xx (bad extension),
storage upload failure (network, 413 if a file exceeds the project limit — show the
message, keep the previous URL value untouched), and abandoning the form after a
successful upload (orphan object in the bucket — accepted, see below).

## Cache-control fix (mobile-latency prerequisite)

Verification after the migration run showed objects in `dance-media` serving
`cache-control: no-cache` even though the script sent
`Cache-Control: max-age=31536000` on upload — the Storage API did not persist the
intended metadata. Consequence: neither the CDN edge nor the mobile client caches
anything, so every repeat view re-downloads from origin. Fixing this has a larger
real-world latency impact than any size limit.

1. **Diagnose** the correct way to set object cache metadata. First hypothesis:
   the mechanism difference is **request header vs multipart form field**, not
   raw-fetch vs SDK. storage-js sends `cacheControl` as a
   `cache-control: max-age=…` request header when the body is a
   Buffer/ArrayBuffer (the server path — the same mechanism as the migration
   script's raw header, `scripts/migrate-dance-media.mjs:279`), but as a
   multipart **form field** when the body is a browser Blob/File (the
   `uploadToSignedUrl` path). So HEAD an existing `catalog-art` object
   (uploaded via the SDK's Buffer path, `catalog-service.ts:163`):
   - If it serves `max-age=31536000, immutable`, the header form works and both
     new upload paths can use the SDK options as written.
   - If it also serves `no-cache` (likely under this hypothesis), the browser
     signed-upload path is probably fine as-is (form field), but the **server
     image endpoint must send FormData with the `cacheControl` field** (or set
     metadata via the S3 route) instead of the SDK's Buffer path — and
     `catalog-art` has the same latent bug, worth fixing the same way. Confirm
     with one throwaway test upload + HEAD per mechanism.
2. **New uploads**: both admin upload paths must store
   `cache-control: max-age=31536000, immutable` (safe because object names are
   fresh and never reused).
3. **Backfill** the already-migrated objects with a one-off script. Prefer the
   S3-compatible endpoint's `CopyObject` onto the same key with
   `MetadataDirective: REPLACE` (metadata-only rewrite, no ~12 GB byte round-trip);
   fall back to download→re-upload with `x-upsert` if the S3 route is unavailable.
   **External state change → approval gate.**
   **Ordering constraint**: the re-upload fallback rewrites legacy objects whose
   content types (`video/quicktime`, `image/gif`, `image/jpeg`, `image/png`) are
   outside the new `allowed_mime_types` list — the bucket policy would reject
   them. The backfill must therefore run **before** the mime restriction is set
   on the bucket (the `CopyObject` path avoids re-upload but ordering the
   backfill first is safe for both paths). The execution order below reflects
   this.

Related mobile-side note (out of this plan's code scope, recorded as a
prerequisite for the playback feature): no video player is installed in
`apps/mobile` yet. Use **expo-video** (the Expo SDK 55 standard; expo-av is
deprecated) — it wraps AVPlayer (iOS) and ExoPlayer/Media3 (Android), both of
which stream progressive mp4 over HTTP range requests natively: playback starts
after buffering a few seconds, never download-then-play. Supabase Storage serves
range requests, so no extra streaming infrastructure is needed. The player-side
conditions this plan already guarantees on the file side: H.264 + AAC in mp4
(universal codec support — iPhone-default HEVC can fail on older Androids, another
reason for the "export H.264" guidance), sane bitrate (the guard), and
`thumbnail_url` rendered as an instant poster while the video buffers. Adaptive
streaming (HLS) only becomes relevant with the transcode follow-up.

## Out of scope (explicitly)

- Video transcoding/HLS and audio re-encoding — later pass (background worker or a
  hosted service) if egress/playback size becomes a problem. Image compression IS
  in scope (see the image endpoint).
- Deleting replaced/orphaned objects — storage cost is negligible; a cleanup script
  can list objects unreferenced by any URL column later.
- Bulk upload / drag-and-drop multi-file.
- Mobile changes — none needed; it only ever sees URLs.

## Test plan

- **Server (Vitest, `apps/server/tests/`)**: for both endpoints — 401 without JWT,
  403 non-admin, 400 unknown field / field-target mismatch / disallowed extension
  (explicitly including `.mov` and `.webm` on video fields), uppercase extension
  accepted and normalized (`.MP4` behaves like `.mp4`),
  image field rejected on the ticket endpoint (and vice versa), success shape
  (mock `createSignedUploadUrl` / storage upload — the bucket-ensure step also
  hits storage, so mock bucket read/create too), Supabase failure → 500. For the
  image endpoint: non-image bytes → 400; processed output is webp within the pixel
  bounds; a >10 MiB file → 413 (the per-request limit makes `file.toBuffer()`
  throw — the client pre-check is not the only stop); and a `catalog-art` upload
  between 5 and 10 MiB still fails, proving the global 5 MiB cap is untouched by
  the per-request override. Assert generated paths match
  `^(moves|tracks)/[^/]+/<slug>-\d+\.<ext>$`
  and never collide with migration-style fixed names.
- **Admin (Vitest, next to `media-url-input.test.ts`)**: unit tests for the
  extracted bitrate-guard function — the ×8 bits-vs-bytes math (a 60 s / 60 MB
  file is 8 Mbps, not 1 Mbps), the 8 Mbps threshold boundary, the
  metadata-timeout reject branch, and the per-kind size pre-check. Plus a
  `MediaUploadInput` test covering the per-kind `accept` list and that a guard
  rejection leaves the current form value untouched.
- **Admin (manual)**: upload each kind on Edit and Create, verify preview, save,
  reload; paste-URL path still works; an iPhone `.mov` is rejected up front by
  the accept/extension check; a >100 MB video, a >8 Mbps video, a video whose
  metadata cannot be read (e.g. HEVC bytes renamed to `.mp4` — test this on
  **Chrome**; on Safari it plays natively and passes, the accepted residual gap),
  and a >10 MB
  image are rejected client-side with the friendly message; an uploaded
  8 MB photo lands as a small webp at the right tier (800 px thumbnail vs 1600 px
  detail); HEAD an uploaded object and confirm
  `cache-control: max-age=31536000, immutable`.
- **Typecheck/lint**: `corepack pnpm typecheck`, `corepack pnpm lint`.

## Execution order

1. Diagnose the cache-control persistence issue: HEAD an existing `catalog-art`
   object first (read-only); fall back to one throwaway test upload only if needed.
2. `packages/types`: DTOs.
3. `apps/server`: both routes + schemas (per-request 10 MiB file limit on the
   image route; global multipart stays at 5 MiB) + tests. No external state
   change in code — the ticket endpoint only mints tokens and bucket creation is
   idempotent (staging already has it).
4. **Approval gate**: run the cache-control backfill script over the migrated
   objects — external state change. Must precede step 5: the re-upload fallback
   rewrites legacy objects whose content types are outside the new mime
   allow-list (see the ordering constraint in the cache-control section).
5. **Approval gate**: set `file_size_limit` (100 MiB) and `allowed_mime_types`
   (`video/mp4`, `audio/mpeg`, `audio/mp4`, `image/webp`) on the existing staging
   `dance-media` bucket — external state change. (Required, not optional:
   `allowed_mime_types` is the only real content-type enforcement on the
   signed-upload path.)
6. `apps/admin`: `MediaPreview` video kind → `MediaUploadInput` (size + bitrate
   pre-checks, two upload flows) → wire into both forms.
7. Manual QA on staging, then commit (`feat(admin): direct dance media upload`).

## Open questions

- ~~`webm`/`mov`/`m4a` in the allow-list~~ — resolved: `webm` is excluded (iOS
  AVPlayer cannot play it) and `mov` is excluded (iPhone HEVC default; Safari
  plays HEVC natively so the client bitrate guard cannot catch it there — see
  the extension validation above). `m4a` stays (AAC — native on both AVPlayer
  and ExoPlayer).
- Whether replacing a file should also clear the old object — deferred to the
  cleanup-script follow-up.
