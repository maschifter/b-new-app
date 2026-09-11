# Dance Flow — Implementation Plan (V1)

Port the Boogiz "learn a dance" flow to bnew app, rebuilt on bnew conventions
(pnpm/Turborepo, Fastify + Supabase, Expo Router + Jotai + TanStack Query).
Feature parity with the Boogiz **core** journey, but cleaner and more performant.

## Decisions (locked)

- **Scope V1 = Core learn + scan.** Choose genre → move → learning videos →
  3-2-1 countdown → record → upload → external scan → show score. Explicitly
  **out of V1**: battles, AI filters (RecordTransition/SelectFilter), avatar
  videos, coins/monetization, rank points, onboarding popups, daily-free limit.
- **Queue = the `dance_scans` table itself** (no Redis, no pg-boss, no extra
  dependency). The scan record doubles as the job: an in-process interval worker
  claims `pending` rows and processes them. A queue is still warranted — the
  external scan server is fragile + slow (~90s) so we need async + retry +
  concurrency limiting — but all three are cheap over a table. Claiming stays on
  supabase-js via a **conditional `UPDATE … WHERE id=? AND status='pending'`**
  (atomic, multi-replica safe); `SELECT … FOR UPDATE SKIP LOCKED` is not available
  through PostgREST. Not chosen: pg-boss (adds a dep + a direct Postgres
  connection requirement for archiving/cron we don't need at V1 scale);
  fire-and-forget in-request (loses retry + concurrency limiting — the whole
  reason Boogiz queued).
- **Camera = react-native-vision-camera** (fps/bitrate control, future frame
  processors). Requires an EAS dev client build — not Expo Go.
- **Entry point = top-right button on the My Studio tab** (see §4 Entry point).
- **Defaults (confirmed):**
  - Video mapping (from `scripts/import-boogiz-dancemoves.mjs`): `main_video_url`
    = learning video (Learn screen), `dancer_tip_video_url` = pro tip,
    `presentation_video_url` = presentation, `pro_dancer_video_url` = real-person;
    **`film_yourself_video_url` = both the PiP reference during recording and the
    `expert_url` sent to the scan server.**
  - Recording: `audio:false` (no captured audio), `fps 30`, `videoBitRate 1.5`
    (Mbps), output mp4. The move's `music_id` track plays (heard, not captured) —
    **music playback is in V1** (see recording-length + music-playback below).
  - **Recording length (confirmed from Boogiz `ViewOnTop`/`CameraView`): read the
    reference video duration at runtime — no stored column.** When
    `film_yourself_video_url` loads, its player `onLoad` yields `duration`; record
    for `limitTimer = (floor(duration) + 1)` seconds and stop when a progress timer
    of that length finishes (`FILM_STEP.FINISHED` → `stopRecording()`). If duration
    can't be read, fall back to the **Boogiz `LIMIT_TIMER = 60 s`**. This matches
    Boogiz exactly and needs **no schema change** (`dance_moves` stays as-is).
  - **Music playback (V1): the move's `music_track.audio_url` plays during
    recording, seeked to the beat-drop (`delay_before_avatar_dance`) — full Boogiz
    parity.** `music_tracks.audio_url` is `not null` (schema-confirmed), so the Record
    screen streams it (heard, not captured — recording stays `audio:false`). Boogiz
    reads `bpm` + `delayBeforeAvatarDance` off the music object; bnew keeps `bpm` on the
    **move** (below) but keeps `delay_before_avatar_dance` on **`music_tracks`** (its
    natural home — Boogiz stores it on `app/models/music.js`; the moves API already
    joins the track, so no extra join). **Ported verbatim (locked):** the music is
    seeked to `getAudioSeekTime = floor(delay_before_avatar_dance / 1000)` seconds and
    the Record flow gates on a `DELAY_BEFORE_AVATAR_DANCE` step with
    `delayForTimer = max(delay_before_avatar_dance − countdownSeconds·1000, 0)` (§3
    dance-core, §4 Record). This aligns the audible track with the `film_yourself`
    reference clip (which starts at the choreography), so the user dances to the right
    part of the song. **Null handling:** the column is nullable; `null/0` ⇒ `seek = 0`
    and `delayForTimer = 0`, degrading gracefully to "music from the start" for tracks
    with no authored drop. `delay_before_avatar_dance` is imported from the Boogiz
    `musics` collection (field exists there — see §1, §Repo import). Scoring stays
    pose-only, so music never affects the score; this is a UX/feel requirement.
  - **Countdown (confirmed from Boogiz):** `countDownInSecond = (60 / bpm) * 4`
    (4 beats). `bpm` is read from **`dance_moves.bpm`** (bnew keeps bpm on the
    move; Boogiz kept it on the music object — same value, one join fewer). The
    column is nullable, so when `bpm` is null/0 use the **Boogiz default `bpm = 106`**
    (`payload…music_bpm || 106`) → countdown ≈ `2.26 s`. Display `3 → 2 → 1 → "Go"`
    over that duration, linear; **start the camera at 50 % of the countdown**
    (`setTimeout(onStartCamera, floor(duration/2))` — Boogiz starts recording
    halfway through so the user is already filming as the reference begins).
    Recording then runs for the length of `film_yourself_video_url`.
  - Eligible moves: consumer API serves only `status='published'` moves **with a
    non-null `film_yourself_video_url`** (others can't be scored).
  - No skill/ownership table in V1 — each attempt is just a `dance_posts` row.
    "First time on this move" (used by the bonus table) is **derived** from
    whether the user already has a `scored` `dance_posts` row for that
    `dance_move_id`; no extra table needed. **Deliberate divergence from Boogiz
    (locked):** Boogiz's `isFirstLearnedSkill` is *global* — true only when the
    user has **never learned any skill** (`Skills.countDocuments({userId,
    learned:true}) === 0`, `score-worker.js`). bnew uses **per-move** first-time
    instead (first `scored` post for *this* `dance_move_id`), which is the more
    sensible product semantics and needs no ownership table. This changes only the
    stored `updated_score` (the bonus), which V1 does **not** surface (displayed
    score is the raw match %), so there is **no V1 user-visible effect**; revisit
    when rank points ship (§7).
  - **Displayed score: raw external match score `0..100`.** The Boogiz bonus
    table (`SCAN_SCORES_SYSTEM`) is ported into `dance-core` and `updated_score`
    is still computed + stored, but the Result screen shows the raw match % —
    rank points are out of V1 (§7), so the bonus does not drive any V1 UI. Flip
    to showing `updated_score` when rank points ship.
  - Scan-server reachability — **asymmetric, confirmed from the repo:** the
    **expert** side (`film_yourself_video_url`) already lives in the **public**
    `dance-media` bucket (admin media is stored via `getPublicUrl`), so `expert_url`
    is that public URL sent **directly — no signing**. The **amateur** side lives in
    the new **private** `dance-videos` bucket, so `amateur_url` is a **signed read
    URL (minutes TTL)** minted per attempt. Only the amateur side needs signing.
  - **Amateur video URL = never stored.** `dance_posts` keeps only `video_path`
    (the Storage object path) as the source of truth; the bucket is private so any
    playback/scan URL is a **signed read URL resolved on demand** (minutes TTL). No
    long-lived `video_url` column — a stored URL would just expire.
  - **Music is fixed to the move in V1.** Each move already has a `music_id`; the
    Record `createPost` uses `move.music_id` and there is **no music picker** on the
    Learn screen (avoids a `music_tracks` browse + keeps the countdown bpm, which is
    always read from `dance_moves.bpm`, consistent). Music-swap is post-V1 (§7).
  - **Score polling has no hard time cap.** The Result screen polls until
    `status ∈ {scored, failed}` with light backoff (2 s → 5 s). The backend
    worst-case (90 s scan timeout × up to 3 attempts + backoff) can exceed a minute,
    and the fallback (§2.3) guarantees a terminal result, so the client must not
    give up early. If scanning is still running past a soft threshold (~90 s), show
    a non-blocking "still scoring — check back" affordance rather than an error;
    the post resolves to a score later.
  - **Scan HTTP contract (confirmed from `boogiz-server`, verbatim):** `POST`
    form-urlencoded `expert_url` + `amateur_url` + `jobid`; 90 s timeout;
    response JSON `{ score: 0..100, jobid }`. Two prod URLs
    (`pose-compare-cem.replit.app`, `pose-compare-2.replit.app`) → move to env
    `SCAN_SERVER_URLS`, try in order with a ~1 s delay between them.
  - **Fallback score (confirmed): random `50..70` inclusive**, `is_external_score
    = false` (Boogiz `Math.floor(random*21)+50`).
  - **Worker tuning (match Boogiz): concurrency `3`, `attempts` up to `3`,
    exponential backoff base `3 s`.**

## Current state of the repo (already done)

Content/authoring side is **already built**:

- DB: `dance_genres`, `music_tracks`, `dance_moves`, `dance_move_genres`
  (`supabase/migrations/20260825192507_create_dance_moves.sql`). RLS on, no client
  policies → server secret-key client only.
- Admin panel + server admin routes: full CRUD for genres/moves/music + media
  upload to Supabase Storage (`apps/server/src/modules/admin/dance-*`).
- Boogiz import script (`scripts/import-boogiz-dancemoves.mjs`).

What is **missing** and covered by this plan: consumer (mobile-facing) API, the
mobile dance feature, and the scanning-server integration + queue.

## Architecture overview

```
apps/mobile/features/dance ── HTTP ──> apps/server/modules/dance (consumer API)
                                              │
   video ── signed upload ──> Supabase Storage (dance-videos bucket)
                                              │
                              dance_scans table = queue (pending rows)
                                              │
                              interval worker + scanning-client adapter
                                              │
                              external pose-compare servers (2 URLs, fragile)

packages/dance-core   pure scoring + status rules (RN/Fastify-free)
packages/types        shared DTOs (DanceGenre, DanceMove, DancePost, ScanStatus…)
```

Boundary rules (enforced): mobile never imports server; pure rules live in
`packages/dance-core`; wire DTOs live in `packages/types`; the scanning-server
client and queue live inside `apps/server/src/modules/dance`.

---

## 1. Database (new migrations)

New migration `create_dance_flow.sql` (review before `db:push`; approval required).

### `music_tracks.delay_before_avatar_dance` — additive column (beat-drop offset)
Additive migration (safe, backward-compatible). Boogiz stores this on the music
model (`app/models/music.js`, `Number`, ms); bnew mirrors it on `music_tracks`:
```
alter table public.music_tracks
  add column delay_before_avatar_dance integer;   -- ms into the track where the
                                                  -- choreography/beat-drop begins;
                                                  -- nullable → treated as 0 (no seek)
```
Backfilled by re-running `scripts/import-boogiz-dancemoves.mjs` (map
`document.delayBeforeAvatarDance` → `delay_before_avatar_dance` in `mapMusic`; the
field is present in the Boogiz `musics` collection). Consumed by the Record screen
for music seek + `delayForTimer` (§Decisions music-playback, §3, §4 Record).

### `dance_posts` — a user's recorded attempt
```
id             uuid pk
owner_id       uuid not null            -- auth user (request.user.sub)
dance_move_id  uuid not null references dance_moves(id)
music_id       uuid references music_tracks(id)
video_path     text                     -- Supabase Storage object path (amateur) — source of truth
video_length_s numeric
status         text not null default 'uploading'
                 check (status in ('uploading','uploaded','scoring','scored','failed'))
                 -- lifecycle: uploading → uploaded → scoring (set when the worker
                 -- claims the scan) → scored. In V1 the fallback (§2.3) always yields
                 -- a terminal score, so 'failed' is never reached — kept in the CHECK
                 -- for post-V1 headroom.
score          integer                  -- displayed score = raw external match %
                                         -- (dance_scans.original_score, 0..100), NOT
                                         -- updated_score; see §Decisions displayed-score
created_at / updated_at timestamptz
```
Indexes: `(owner_id, created_at desc)`, `(dance_move_id)`. RLS on, server-only.

### `dance_scans` — one scan record per post, **also the job queue**
Mirrors Boogiz `scanning` and carries the queue state (no separate jobs table).
```
id               uuid pk
post_id          uuid not null references dance_posts(id) on delete cascade
owner_id         uuid not null
status           text not null default 'pending'
                   check (status in ('pending','processing','completed','failed'))
attempts         integer not null default 0
next_run_at      timestamptz not null default now()  -- backoff gate
locked_at        timestamptz            -- set on claim; used to reap stuck rows
original_score   integer                -- raw 0..100 from external server
updated_score    integer                -- original + bonus (dance-core)
is_external_score boolean not null default false
error            text
created_at / updated_at timestamptz
```
Unique `(post_id)`. Partial index for the worker claim:
`(next_run_at) where status = 'pending'`.

All tables: `enable row level security` with **no client policy** (consumed via
the server secret-key client), matching the existing dance tables.

---

## 2. Server — consumer module `modules/dance`

Mount in `app.ts`: `app.register(danceRoutes, { prefix: "/api/dance" })`.
All routes guarded by `app.authenticate`; `ownerId = request.user.sub`. Responses
use `ApiSuccess<T>`. Zod-validate all inputs.

### 2.1 Catalog reads (published only)
- `GET /api/dance/genres` → published genres, sorted by `sort_order`.
- `GET /api/dance/moves?genre_id=&cursor=&limit=` → published moves, **cursor
  pagination** (cursor = `(sort_order, created_at, id)`; never derive pagination
  from item counts). Joins genres + music track (incl. `audio_url` for playback).
  Returns the stored public media URLs as-is (video isn't Supabase-transformable;
  no server-side resize — do not claim optimized URLs). The joined music track
  includes `audio_url` **and `delay_before_avatar_dance`** (Record-screen seek, §4).
- `GET /api/dance/moves/:id` → full move detail (all video links + music, incl.
  `music.delay_before_avatar_dance`).

### 2.2 Record → upload → scan
Direct-to-storage upload (Fastify multipart is capped at 5 MB — must NOT proxy
video through the API):

1. `POST /api/dance/posts` `{ danceMoveId, videoLength }`
   → server resolves `musicId` from the move (`move.music_id`; not client-supplied),
   creates the `dance_posts` row (`status='uploading'`), returns
   `{ postId, upload: { signedUrl, path } }` (Supabase Storage signed upload URL,
   `dance-videos` bucket, key `owner_id/postId.mp4`). `path` is persisted as
   `video_path`.
2. Mobile uploads the mp4 directly to `signedUrl`.
3. `POST /api/dance/posts/:id/uploaded` → server marks `status='uploaded'` and
   inserts the `dance_scans` row (`status='pending'`) — that row **is** the queued
   job; the interval worker (§2.4) picks it up. No URL is stored: the worker (and
   later playback) resolves a short-TTL **signed read URL** from `video_path` on
   demand. Returns the post.
4. `GET /api/dance/posts/:id/score` → polling endpoint. Returns
   `ScanStatus { status, hasScore, score, isExternalScore, jobState }`.

### 2.3 Scanning client adapter (`modules/dance/scanning-client.ts`)
Contract confirmed against `boogiz-server/app/utils/external-scanning.utils.js`.
- URLs from env `SCAN_SERVER_URLS` (comma-separated) — do **not** hardcode
  Replit URLs. Boogiz prod values (for env, not code):
  `https://pose-compare-cem.replit.app`, `https://pose-compare-2.replit.app`.
- Request: `POST` `application/x-www-form-urlencoded`
  `expert_url=<move.film_yourself_video_url>&amateur_url=<signed read URL resolved
  from post.video_path>&jobid=<postId>`; timeout `90000` ms. The amateur URL is
  minted per attempt (short TTL) so it is fresh even across retries/backoff.
- Response: JSON `{ score, jobid }`, validate `score` is a number in `0..100`.
- Resilience: try URL 1 → on error/invalid retry then try URL 2 (~1 s delay
  between URLs) → on total failure produce a **fallback score** (random `50..70`,
  `is_external_score=false`), matching Boogiz so the user always sees a result.

### 2.4 Interval worker (`modules/dance/scan-worker.ts`)
No queue library — the `dance_scans` table is the queue. "Enqueue" = the
`in_progress`… i.e. `pending` row inserted by `posts/:id/uploaded`.

- Started from `buildApp` boot as a `setInterval` (~2s tick), stopped on
  `app.close` (`onClose` hook). One shared timer per process. A **re-entrancy
  guard** (module-level `isTicking` flag) makes an overlapping tick a no-op — a
  scan runs ~90 s while the tick fires every ~2 s, so ticks *will* overlap.
- **Each tick** (all via supabase-js, no direct pg connection):
  1. Compute the **claim budget** first: `budget = N − inFlight`, where
     `inFlight` = count of this replica's rows already in `processing`
     (`SELECT count(*) … status='processing'`). If `budget <= 0`, skip the tick —
     the scan server is already at capacity. Then select up to `budget` claimable
     rows: `status='pending' AND next_run_at <= now()` (order by `created_at`,
     `LIMIT budget`). `N` is the **concurrency cap** on the fragile scan server
     (defaults to `3`, matching Boogiz worker concurrency). Counting in-flight is
     what actually bounds concurrency: a bare `LIMIT N` per tick would claim N
     *fresh* rows every 2 s on top of the ~90 s-long in-flight ones and blow past
     the cap.
  2. Claim each atomically:
     `UPDATE dance_scans SET status='processing', locked_at=now()
      WHERE id=? AND status='pending'` — 0 rows affected ⇒ another replica took
     it, skip. (Atomic conditional update ⇒ multi-replica safe.) On a successful
     claim also flip the post to `status='scoring'`.
  3. Process claimed rows in parallel (bounded by `budget`): load post+move → call
     scanning-client → compute `updated_score` via `dance-core` → update
     `dance_scans` (`completed`, both `original_score` + `updated_score`) +
     `dance_posts` (`status='scored'`, `score = original_score` — the raw match %,
     not the bonus-adjusted value).
  4. On retryable error: `attempts=attempts+1`; if `attempts < 3` set back to
     `pending` with `next_run_at = now() + backoff(attempts)` (exponential, base
     `3 s` — Boogiz parity); else write the **fallback score** (random `50..70`,
     `is_external_score=false`), mark the scan `completed`, and resolve the post to
     `status='scored'` with that score — so the mobile poll always terminates and
     the V1 `dance_posts.status='failed'` branch stays unused.
- **Stuck-row reaper**: rows in `processing` with `locked_at` older than the
  configured scan client's maximum failover duration plus a safety margin are reset to
  `pending` — recovers jobs orphaned by a mid-flight restart without reclaiming a live scan. Idempotent per
  `postId`.

### 2.5 Tests (Vitest, `apps/server/tests`)
Per route: auth required, invalid input (bad uuid/limits), success, not-found,
Supabase failure. Scanning-client: primary success, failover to secondary,
fallback on total failure, invalid-score rejection. Worker: happy path + retry +
terminal-failure writes fallback.

---

## 3. `packages/dance-core` (new pure package)

RN/Fastify-free, runnable in Node + browser + jest. Vitest tests in `src/__tests__`.

- `computeBonus(rawScore, isFirstTime): number` and `finalScore(...)` — port the
  Boogiz `SCAN_SCORES_SYSTEM` bonus table verbatim (kept internal even though V1
  doesn't surface rank points yet; used to fill `updated_score`). Exact table
  (`{ firstTime, other }` bonus added to the raw score by matched bracket; scores
  `0` and `96..100` fall in **no** bracket → **no bonus**):
  ```
  1-20  → { firstTime: 20, other: 15 }
  21-40 → { firstTime: 35, other: 18 }
  41-60 → { firstTime: 20, other: 18 }
  61-70 → { firstTime: 12, other: 10 }
  71-80 → { firstTime:  8, other:  6 }
  81-90 → { firstTime:  5, other:  0 }
  91-95 → { firstTime:  3, other:  0 }
  ```
  `isFirstTime` = user has no prior `scored` `dance_posts` for the move (§Decisions).
  Note the bonus *table* is ported verbatim from Boogiz, but the `isFirstTime`
  *signal* is intentionally per-move here, not Boogiz's global first-learned-skill
  (§Decisions) — only affects the stored, not-yet-surfaced `updated_score`.
- `coerceScanStatus(row)` → normalized `ScanStatus`.
- `isValidExternalScore(x): boolean` (number, `0..100`).
- `countdownSeconds(bpm: number | null): number` — pure countdown math shared with
  the Record screen: `(60 / (bpm || DEFAULT_BPM)) * 4`, with `DEFAULT_BPM = 106`
  (Boogiz parity) covering the nullable `dance_moves.bpm`. Camera-start-at-50 % is
  a UI timing concern kept in the mobile component, but the duration comes from here.
- `musicSeekSeconds(delayMs: number | null): number` — port of Boogiz
  `getAudioSeekTime`: `floor((delayMs ?? 0) / 1000)` (seconds to seek the track to).
- `delayBeforeTimerMs(delayMs: number | null, bpm: number | null): number` — port of
  Boogiz `getCommon().delayForTimer`: `max((delayMs ?? 0) − countdownSeconds(bpm)·1000,
  0)`. Both take `delay_before_avatar_dance` (ms) from the joined `music_tracks`; both
  return `0` when the delay is null (graceful "music from start"). Drives the Record
  screen's `DELAY_BEFORE_AVATAR_DANCE` step (§4 Record).
- Fallback-score generator: random **`50..70`** inclusive (RNG injected so it's
  testable), Boogiz parity.

DTOs (`DanceGenre`, `DanceMove`, `DancePost`, `ScanStatus`, request/response
bodies) go in `packages/types/src/index.ts`, reused by server + mobile.

---

## 4. Mobile — `features/dance` (atomic split)

```
apps/mobile/src/features/dance/
  index.ts
  api.ts               # typed fetch fns off apiUrl (client.ts conventions)
  _atoms/
    queries.ts         # genres, moves (infinite+cursor), moveDetail, scoreStatus
    mutations.ts       # createPost, markUploaded
    ui.ts              # selectedGenreId, selectedMoveId, videoRate, film step
    effects.ts         # score polling driver (start on 'uploaded')
  ui/                  # screens + components (see below)
```

Follows all §6 rules from CLAUDE.md: server-state via `jotai-tanstack-query` on
the shared `QueryClient`; auth via the query-auth atom (`{ userId, accessToken }`);
`userId` in every user-scoped key; moves list via `atomWithInfiniteQuery` + a
derived flat list.

### Entry point
Top-right button on the **My Studio** tab. `studio-screen.tsx` already renders a
floating top overlay (`absolute inset-x-0 top-0 flex-row justify-between`, avatar
left / Visitors pill right). Add a Dance button to the right cluster via a new
`onOpenDance?: () => void` prop on `StudioScreen`; wire it in the thin route
`app/(tabs)/studio.tsx` as `router.push("/dance")` (same callback pattern as the
existing `onOpenShop`/`onOpenProfile` — studio does not import the dance feature,
so the inward-dependency boundary holds). No nav-header work (`headerShown:false`).

### Screens & navigation (`app/dance/…`, thin route files; declared inside the
`Stack.Protected` session block of the root `_layout.tsx`)

1. **Choose move** (`ChooseDanceMovesScreen` analog)
   - Horizontal genre selector + moves carousel (`SkillCardItemV2` analog:
     autoplaying video card via `expo-image`/`expo-video`), shuffle, "Choose".
   - Skeleton on `isPending`, `ListEmptyComponent`, pull-to-refresh, infinite
     scroll (`onEndReached` → `fetchNextPage`, footer spinner).
2. **Learn** (`StartToFilmScreen` analog)
   - Paged learning videos (learning / pro-tip / presentation), playback-speed
     bar, "Scan and get points" CTA → record. **No music picker** — the move's
     `music_id` is used as-is (music-swap deferred, §7).
3. **Record** (`FilmYourSelfContainer` analog)
   - vision-camera front device; **3-2-1 countdown** (`CountDown` port,
     Reanimated); dual-video PiP (user camera ↔ reference video flip); FILM_STEP
     state machine, ported from Boogiz verbatim (`Film/constants/index.ts`:
     `NONE(0), BEFORE_CONFIRM(1), READY(2), DELAY_BEFORE_AVATAR_DANCE(3), TIMER(4),
     START_CAMERA(5), RECORDING(6), STOP(7), FINISHED(8)`): READY →
     **DELAY_BEFORE_AVATAR_DANCE** → TIMER → START_CAMERA at ~50% of countdown →
     RECORDING → **STOP** → FINISHED. Note the `STOP(7)` step between RECORDING and
     FINISHED: the music `AudioItem` gate is `step < DELAY_BEFORE_AVATAR_DANCE ||
     step >= FINISHED`, so playback continues through STOP and only pauses at FINISHED
     — port the step so the audio-stop timing matches Boogiz exactly. On record
     tap the machine enters `DELAY_BEFORE_AVATAR_DANCE`: seek the music to
     `musicSeekSeconds` and start playback, then wait `delayBeforeTimerMs` (both from
     `dance-core`, §3) before advancing to TIMER — this is what lands the audible
     track on the beat-drop in sync with the reference clip. Camera permission via
     `argent-settings-permissions`/expo
     permissions; blurred overlay when not granted. Records to a local file.
   - **Recording length = reference-video duration read at runtime** (Boogiz
     parity): the PiP reference (`film_yourself_video_url`) `onLoad` sets
     `videoLength = floor(duration) + 1`; a progress timer of that length drives
     `RECORDING → FINISHED` and calls `stopRecording()`. Fallback `60 s` if
     duration is unavailable. The recorded amateur clip's own `duration`
     (`onRecordingFinished`) becomes `videoLength` in `POST /posts`.
   - **Music plays during recording (V1), seeked to the beat-drop:** stream
     `move.music_track.audio_url` (heard, not captured) via an audio player dep
     (`expo-audio`, Expo SDK 55 default). Playback starts at the `DELAY_BEFORE_AVATAR_DANCE`
     step, seeked to `musicSeekSeconds(move.music_track.delay_before_avatar_dance)` and
     paused again at FINISHED (Boogiz `AudioItem` gate: `paused = step <
     DELAY_BEFORE_AVATAR_DANCE || step >= FINISHED`). `bpm` for the countdown still
     comes from `dance_moves.bpm`; the seek/`delayForTimer` offset from
     `music_tracks.delay_before_avatar_dance`. **Device-QA note:** verify the audio
     lands where expected on device (the exact `AudioItem` seek/reset behavior is an
     impl detail to confirm live), and that playback coexists with `audio:false`
     vision-camera capture.
4. **Result** (`FilmYourSelfFinalContainer` analog)
   - `createPost` → upload file to signed URL → `markUploaded` → poll
     `scoreStatus` until `status ∈ {scored, failed}` (backoff 2 s → 5 s, **no hard
     time cap**; backend fallback guarantees a terminal result). Past a soft
     threshold (~90 s) show a non-blocking "still scoring — check back" affordance
     instead of erroring; the post resolves to a score later.
     Explicit loading UI for upload + scanning (Suspense only for initial reads).

Styling: NativeWind `className` for static, RN `style` for runtime/animated.
Selective Suspense + shared query error boundary + accessible retry for initial
query reads; keep auth/param guards above the boundary.

### Tests (jest-expo + RNTL)
Move list (loading/empty/data/pagination), countdown timing, record state
machine transitions (mock camera), score-polling resolution incl. fallback.

---

## 5. Storage & native setup

- **Bucket** `dance-videos` (**new, private**) for amateur recordings + server-issued
  signed upload URLs; the scan server fetches the amateur video via a **signed read
  URL (minutes TTL) minted per attempt**. This is a distinct bucket from the existing
  **public** `dance-media` bucket that holds content videos (expert side) — reuse the
  same Supabase Storage plumbing as admin media, but do not make `dance-videos` public.
- **vision-camera**: add dep, config plugin, camera/mic usage strings; produce an
  **EAS dev client** (documented). Camera can't be exercised on the iOS simulator
  — device verification needs a physical device (recording, countdown sync, PiP).
  Confirm dev-client build ownership + which physical device is used for camera QA
  before milestone 5 (memory: user runs the app themselves).
- **Audio playback**: add `expo-audio` (SDK 55) for the in-recording music track
  (`music_tracks.audio_url`), seeked to `music_tracks.delay_before_avatar_dance`
  (§4 Record). Verify on device that it plays alongside vision-camera recording
  (playback + `audio:false` capture must coexist) and that the seek lands on the
  beat-drop in sync with the reference clip.
- Env: `SCAN_SERVER_URLS`, `DANCE_VIDEO_BUCKET`, `SCAN_WORKER_CONCURRENCY`
  (tick `N`), `SCAN_WORKER_ENABLED` (default on — turn off on non-worker replicas;
  V1 pins the service to a single worker replica so `N` is the global scan-server
  concurrency bound). No extra Postgres connection string — the worker uses the
  existing `app.supabase` secret-key client.
- `dance-videos` bucket config (`supabase/config.toml`): `public = false`,
  `file_size_limit = "45MiB"` (match `dance-media`), `allowed_mime_types = ["video/mp4"]`.

---

## 6. Milestones

1. **Data + types** — migrations (`dance_posts`, `dance_scans`, queue; plus the
   additive `music_tracks.delay_before_avatar_dance` column + import backfill), DTOs
   in `packages/types` (incl. `music.delay_before_avatar_dance`), `packages/dance-core`
   with scoring/status + countdown/seek/`delayForTimer` math + tests.
2. **Server consumer reads** — genres/moves/move detail + cursor pagination + tests.
3. **Upload + scan pipeline** — signed upload, post lifecycle, scanning-client,
   interval worker (table-as-queue), polling endpoint + tests. (Wire a stub/fake
   scan server for CI.)
4. **Mobile browse** — choose-move + learn screens on the new API.
5. **Mobile record** — vision-camera, countdown, PiP, dev-client build.
6. **Mobile result** — upload + polling + score UI; end-to-end on device.

Ship 1–3 (backend) and 4/6 can proceed in parallel against a seeded catalog.

## 6b. Progress checklist

Tracks execution against §6 milestones. Tick each item as it lands. A milestone
is **done** only when every box under it is checked and its checks pass (typecheck
+ the listed tests). Backend 1–3 and mobile 4–6 may proceed in parallel (§6).

### Milestone 1 — Data + types + `dance-core`
- [x] Migration `create_dance_flow.sql`: `dance_posts` table (§1) — reviewed before `db:push`
- [x] Migration: `dance_scans` table + queue columns (`status`, `attempts`, `next_run_at`, `locked_at`) (§1)
- [x] Migration: partial claim index `(next_run_at) where status='pending'` + unique `(post_id)` (§1)
- [x] Migration: additive `music_tracks.delay_before_avatar_dance` column (§1)
- [x] RLS enabled, **no** client policy on both new tables (§1)
- [x] Approval obtained → `db:push` → `db:types` — generated types regenerated from the linked target; pending commit
- [x] Import backfill: map `delayBeforeAvatarDance` → `delay_before_avatar_dance` in `scripts/import-boogiz-dancemoves.mjs` `mapMusic` (re-run after `db:push`)
- [x] DTOs in `packages/types`: `DanceGenre`, `DanceMove` (incl. `music.delay_before_avatar_dance`), `DancePost`, `ScanStatus`, request/response bodies (§3)
- [x] `packages/dance-core` scaffolded (Vitest, RN/Fastify-free)
- [x] `computeBonus` / `finalScore` — `SCAN_SCORES_SYSTEM` table verbatim (§3)
- [x] `countdownSeconds(bpm)`, `musicSeekSeconds(delayMs)`, `delayBeforeTimerMs(delayMs, bpm)` (§3)
- [x] `coerceScanStatus`, `isValidExternalScore`, fallback-score generator (RNG injected) (§3)
- [x] Unit tests green (dance-core)

### Milestone 2 — Server consumer reads
- [x] Mount `danceRoutes` at `/api/dance` in `app.ts`, all guarded by `app.authenticate` (§2)
- [x] `GET /api/dance/genres` — published, sorted by `sort_order` (§2.1)
- [x] `GET /api/dance/moves` — published only + eligible filter (non-null `film_yourself_video_url`), cursor pagination `(sort_order, created_at, id)`, joins music incl. `audio_url` + `delay_before_avatar_dance` (§2.1)
- [x] `GET /api/dance/moves/:id` — full detail incl. music offset (§2.1)
- [x] Zod validation on all inputs
- [x] Tests: auth required, invalid input, success, not-found, Supabase failure (§2.5)

### Milestone 3 — Upload + scan pipeline
- [x] `POST /api/dance/posts` — resolves `musicId` from move, creates `uploading` row, returns signed upload URL (`dance-videos` bucket, key `owner_id/postId.mp4`) (§2.2)
- [x] `POST /api/dance/posts/:id/uploaded` — mark `uploaded`, insert `pending` `dance_scans` row (§2.2)
- [x] `GET /api/dance/posts/:id/score` — polling endpoint returns `ScanStatus` (§2.2)
- [x] Scanning client (`scanning-client.ts`): form-urlencoded `expert_url`+`amateur_url`+`jobid`, 90s timeout, `SCAN_SERVER_URLS` from env, URL failover, invalid-score rejection (§2.3)
- [x] Amateur signed read URL minted per attempt from `video_path`; expert URL public, sent directly (§2.3, §Decisions)
- [x] Interval worker (`scan-worker.ts`): `setInterval` from `buildApp`, `onClose` stop, re-entrancy guard (§2.4)
- [x] Claim budget `N − inFlight`; atomic conditional `UPDATE … WHERE id=? AND status='pending'`; flip post to `scoring` on claim (§2.4)
- [x] Process: dance-core score → write `completed` + `original`/`updated`; post `scored`, `score = original_score` (§2.4)
- [x] Retry/backoff (base 3s, up to 3 attempts) → terminal fallback score `50..70` (§2.4)
- [x] Stuck-row reaper (`locked_at` > ~3 min → `pending`) (§2.4)
- [x] Server config wired: scan URLs, video bucket, worker concurrency, and worker enablement (§5)
- [x] `dance-videos` private bucket in `supabase/config.toml` (private, 45MiB, `video/mp4`) (§5)
- [x] Tests: routes + scanning-client (success/failover/fallback/invalid) + worker (happy/retry/terminal-fallback) (§2.5)

### Milestone 4 — Mobile browse
- [x] `features/dance` browse scaffold: `index.ts`, `api.ts`, `_atoms/{queries,ui}.ts`, `ui/` (§4)
  - `mutations.ts` and `effects.ts` intentionally arrive with milestones 5–6; mobile conventions prohibit empty state files.
- [x] Query atoms: genres, moves (`atomWithInfiniteQuery` + cursor + derived flat list), moveDetail; `userId` in every key (§4)
- [x] Entry point: `onOpenDance` prop on `StudioScreen`, wired in `app/(tabs)/studio.tsx` → `router.push("/dance")` (§4)
- [x] Routes declared inside `Stack.Protected` in root `_layout.tsx` (§4)
- [x] Choose-move screen: genre selector + moves carousel, shuffle, skeleton, empty, pull-to-refresh, infinite scroll (§4.1)
- [x] Learn screen: paged learning videos, playback-speed bar, CTA reserved for the milestone 5 recording route; no music picker (§4.2)
- [x] Tests: move list loading/empty/data/pagination (§4)

### Milestone 5 — Mobile record
- [ ] Add `react-native-vision-camera` + config plugin + camera/mic usage strings; EAS dev-client build (§5)
- [ ] Confirm dev-client build owner + physical camera-QA device (§5, §8)
- [ ] Add `expo-audio`; music streams `audio_url` seeked to beat-drop, coexists with `audio:false` capture (§4.3, §5)
- [ ] FILM_STEP state machine ported verbatim incl. `DELAY_BEFORE_AVATAR_DANCE` + `STOP` (§4.3)
- [ ] Countdown (`countdownSeconds`), camera start at ~50%, PiP reference flip (§4.3)
- [ ] Recording length = reference `onLoad` duration `floor+1`, fallback 60s; recorded clip duration → `videoLength` (§4.3)
- [ ] Camera permission handling + blurred overlay when not granted (§4.3)
- [ ] Device QA: audio lands on beat-drop, PiP + capture correct (§4.3, §5)
- [ ] Tests: countdown timing, record state-machine transitions (mock camera) (§4)

### Milestone 6 — Mobile result
- [ ] Result flow: `createPost` → upload to signed URL → `markUploaded` → poll `scoreStatus` until `scored`/`failed` (backoff 2s→5s, no hard cap) (§4.4)
- [ ] Score-polling effect driver (start on `uploaded`) in `_atoms/effects.ts` (§4)
- [ ] "Still scoring — check back" affordance past ~90s soft threshold (§4.4)
- [ ] Explicit loading UI for upload + scanning; Suspense only for initial reads + shared query error boundary + retry (§4.4)
- [ ] Displayed score = raw match % (§Decisions)
- [ ] Tests: score-polling resolution incl. fallback (§4)
- [ ] End-to-end on a physical device

## 7. Deferred (post-V1, noted for design headroom)

Battles, AI filters/skins, avatar videos, coins/monetization, rank-points UI
(bonus math already in `dance-core`), onboarding popups, daily-free limit,
QR scanner. Schema keeps room for these without rework.

## 8. Open questions

Resolved during review (now in §Decisions): scan HTTP contract, the two prod scan
URLs, fallback range `50..70`, `SCAN_SCORES_SYSTEM` table, worker concurrency/retry,
countdown formula, recording params — all confirmed verbatim from `boogiz-server` /
`boogiz-rn` (the one intentional non-verbatim item is the `isFirstTime` signal — see
review #6 below).

Also resolved: **displayed score = raw external `0..100`** (Result screen shows the
raw match %; bonus computed + stored via `updated_score` but not surfaced until rank
points ship — see §Decisions).

Also resolved: **`bpm` source + null handling.** `bpm` lives on `dance_moves` (nullable)
— `music_tracks` has none. Countdown reads `dance_moves.bpm` and defaults to `106`
(Boogiz parity) when null/0, so a missing bpm never hides a move or breaks the timer;
eligible filter stays `published + non-null film_yourself_video_url`.

Also resolved (review #2): **(a)** amateur video URL is never stored — `dance_posts`
keeps only `video_path`; playback/scan use signed read URLs resolved on demand.
**(b)** Music is fixed to `move.music_id` in V1 (no picker); music-swap is post-V1.
**(c)** Score polling has no hard time cap — poll until `scored`/`failed` with backoff,
show a "still scoring" affordance past ~90 s; backend fallback guarantees resolution.

Also resolved (review #3): **(1)** Worker concurrency is bounded by counting in-flight
`processing` rows (`budget = N − inFlight`) plus a re-entrancy guard, not a bare
`LIMIT N` per tick (§2.4). **(2)** Expert vs amateur URL is asymmetric — `expert_url`
is the existing **public** `dance-media` URL sent directly; only `amateur_url` (private
`dance-videos`) is signed per attempt (§Decisions, §5). **(3)** `dance_posts.status`
flips to `scoring` on worker claim and always terminates at `scored` in V1 (`failed`
kept for headroom); `dance_posts.score = dance_scans.original_score` (raw match %),
not `updated_score` (§1).

Also resolved (review #4, confirmed with product):

- **No post history in V1 — Result screen only.** A recorded attempt is shown once on
  the Result screen right after scoring; there is **no "my dances" list/feed** and no
  `GET /api/dance/posts` list endpoint in V1. `dance_posts` rows are still persisted
  (source of truth for the scan + score), but browsing past attempts is post-V1 (§7).
- **Worker runs on a single pinned replica in V1.** The in-process `setInterval` worker
  stays, but only **one replica runs it**, so the concurrency cap `N` is the *global*
  bound on the fragile scan server (avoids `N × replicas` overloading it). Enforce via a
  worker-enabled flag (env `SCAN_WORKER_ENABLED`, default on) so extra replicas can run
  the API without the worker; V1 keeps the whole service at 1 replica. Split into a
  separate worker service only if scan volume needs isolation (post-V1). The
  conditional-update claim keeps it correct even if a second worker ever runs.
- **Amateur videos kept indefinitely.** No purge/TTL cleanup in V1. `dance-videos` is a
  private bucket; playback/scan always use short-TTL signed read URLs (§Decisions). A
  retention/purge policy (privacy) is deferred to product post-V1.

Also resolved (review #5, verified against schema + `boogiz-rn` Film container):

- **Recording length is read at runtime from the reference video, not stored.**
  Boogiz's `ViewOnTop`/`CameraView` set `videoLength = floor(onLoad.duration) + 1`
  and record for that long (`ProgressBar` `onFinish` → `stopRecording`), fallback
  `LIMIT_TIMER = 60 s`. bnew ports this verbatim → no new `dance_moves` column
  (§Decisions recording-length, §4 Record).
- **Music playback is in V1, seeked to the beat-drop.** Stream `music_tracks.audio_url`
  (schema-confirmed `not null`) during recording via `expo-audio`; `audio:false` capture
  unchanged. `delay_before_avatar_dance` is added to `music_tracks` + imported and drives
  the music seek + `delayForTimer` (see review #6; §Decisions music-playback, §1, §3,
  §4 Record, §5).
- **Moves API returns stored public URLs as-is** — no server-side video resize
  (video isn't Supabase-transformable); earlier "optimized URLs" wording dropped
  (§2.1).

Also resolved (review #6, verified against `boogiz-rn` + bnew schema):

- **`isFirstTime` bonus signal is per-move, a deliberate divergence from Boogiz.**
  Boogiz's `isFirstLearnedSkill` is *global* (true only when the user has never
  learned any skill — `score-worker.js`); bnew derives first-time **per
  `dance_move_id`** instead (§Decisions, §3). The `SCAN_SCORES_SYSTEM` bonus *table*
  is still ported verbatim; only the first-time signal differs. This affects just the
  stored `updated_score`, which V1 never surfaces (displayed score is the raw match %),
  so there is no V1 user-visible impact — revisit when rank points ship (§7).
- **`DELAY_BEFORE_AVATAR_DANCE` step + music seek are ported into V1 (product call).**
  Boogiz seeks the music by `getAudioSeekTime = floor(delayBeforeAvatarDance/1000)` and
  waits `delayForTimer = max(delayBeforeAvatarDance − countdown, 0)`; this aligns the
  audible track with the `film_yourself` reference clip and is core to the feel. bnew
  had no place to store the offset, so V1 **adds** `music_tracks.delay_before_avatar_dance`
  (additive migration, §1), **imports** it from the Boogiz `musics` collection (field
  confirmed present, `app/models/music.js`), exposes it on the moves DTO, and ports the
  seek + `delayForTimer` math into `dance-core` (§3) driving the restored
  `DELAY_BEFORE_AVATAR_DANCE` film step (§4 Record). Null offset ⇒ seek 0 (graceful
  music-from-start). Music still never affects the pose-only score — this is a UX
  requirement, not a scoring one.

Non-blocking logistics to confirm before milestone 5: EAS dev-client build owner +
the physical device used for camera QA (§5).

No remaining blocking questions — plan is ready to implement.
