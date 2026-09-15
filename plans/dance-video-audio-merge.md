# Dance Post Media — Music Merge, Thumbnail, Blurhash (Plan)

Status: **proposed (2026-09-14)**, revised four times after review (2026-09-14). Follow-up to
`plans/dance-flow.md`, which shipped V1 with the *original, silent* recording as the only
stored artifact.

## Goal

Give every recorded dance post three derived artifacts, produced asynchronously after
upload and never on the critical path of the score:

1. **Merged video** — the recording with the move's music track muxed in, aligned to the
   part of the song the dancer actually heard while filming.
2. **Thumbnail** — a JPEG poster frame.
3. **Blurhash** — a short string used as the image placeholder while the poster loads.

## Current state of the repo (verified)

- Recording is silent by design: `record-dance-screen.tsx` uses `enableAudio: false`,
  `fileType: "mp4"`, `targetBitRate: VIDEO_BIT_RATE`, `CommonResolutions.HD_16_9`. The
  music is played through `expo-audio` so the dancer hears it; it is never captured.
- Upload path: `createPost` (`modules/dance/service.ts`) inserts the row and returns a
  signed upload URL for `dance-videos/<ownerId>/<postId>.mp4`; mobile PUTs the file
  (`features/dance/api.ts:uploadDanceVideo`); `markUploaded` verifies the object exists
  and upserts a `dance_scans` row.
- `dance_scans` is the queue: `scan-worker.ts` runs an interval loop in the API process,
  reaps stuck locks, claims rows with a conditional `UPDATE … WHERE status='pending'`,
  retries with backoff, and falls back to a generated score after `MAX_ATTEMPTS`.
- `dance-videos` is a **private** bucket (`20260912174500_create_dance_videos_bucket.sql`),
  `file_size_limit` 45 MB, `allowed_mime_types = ['video/mp4']`. Reads are short-lived
  signed URLs resolved per request (`withSignedVideoUrl`, TTL 1 h).
- The Profile grid mounts **one `useVideoPlayer` per cell** (`dance-post-grid.tsx:107`)
  purely to show a still frame — there is no poster image today.
- `apps/server` already ships a native dependency (`sharp`), so native binaries are a
  proven pattern on the current Railway deployment.

## Boogiz reference (and what we deliberately change)

| Step | Boogiz | Here |
| --- | --- | --- |
| Merge music | `ffmpeg.utils.js:5 mergeVideoWithAudio`, **re-encodes** with `libx264 -preset medium -crf 23`; fired in-process from `post_controller_v3.js:246` | **Remux** with `-c:v copy`; only the audio is encoded |
| Thumbnail | `ffmpeg.utils.js:64 extractThumbnail`, run **in the request** (`/v3/post/pre-upload` step 8, fail-soft) | Same ffmpeg call, moved **into the background job** |
| Blurhash | `media.utils.js:23 encodeImageToBlurhash` (`sharp` + `blurhash`), only in mongoose hooks for AI videos / avatars — learn-flow posts fall back to a global `DEFAULT_BLURHASH` | Computed for every post, in the same job |
| Infra | Merge/thumbnail run on the API box; **SQS + out-of-repo workers** handle AI stitch, watermark, avatar and content resize | One in-process worker; no new infrastructure |

The source recording has **no audio track at all** and is already H.264/MP4, so the
merge is a container operation. Boogiz's video re-encode is what made the job expensive
enough to justify a worker fleet; dropping it removes the reason.

## Decisions

- **Remux, never re-encode.** `-c:v copy` keeps quality identical to the capture and
  makes a 60 s / ~11 MB clip cost ~1–2 s of CPU and ~50 MB RSS. If a future capture path
  produces HEVC, gate on the probed codec and only then transcode.
- **Merge runs off the scoring path.** Scanning is pose-only and keeps using the original
  silent video. A media failure must never delay or block a score.
- **Second table-as-queue, `dance_media_jobs`**, shaped like `dance_scans` *as it stands
  today* — status / attempts / next_run_at / locked_at / error, unique on `post_id`, and the
  composite `(post_id, owner_id)` FK that `20260911081328` introduced, not the original
  single-column one. Job state stays out of `dance_posts`, matching the split already chosen
  for scans, and the two job types retry independently.
- **The claim loop is copied first, extracted second.** `media-worker.ts` mirrors
  `scan-worker.ts`; only once both are green do we consider lifting the shared claim /
  reap / backoff into a local helper. No refactor of shipped, tested scan code up front.
- **`ffmpeg-static` npm dependency** rather than an image-level apt package — same model
  as `sharp`, so nothing about the Railway build has to change. It is a GPL build used
  server-side only; it must never be bundled into the app.
- **Outputs live in the existing `dance-videos` bucket**, beside the original. The bucket
  needs `image/jpeg` added to `allowed_mime_types`.
- **Audio offset is measured on device, not guessed.** See "Audio alignment" below.
- **No new DTO for media state.** The client infers readiness from nullable fields:
  `mergedVideoUrl`, `thumbnailUrl`, `blurhash`.

## Bandwidth: the worker re-downloads what the device uploaded

Unlike Boogiz — where the clip reached the API as multipart and was already on disk when
ffmpeg ran — mobile here PUTs straight into Storage through a signed URL, so the server
never holds the bytes. The media worker therefore signs a short-lived read URL and pulls
the object back. That is a deliberate trade, not an oversight:

- The direct upload is what keeps the API off the upload path entirely (no multipart
  buffering, no request-size ceiling, no memory spike per concurrent upload). Routing
  uploads back through Fastify to save the re-download would make the API carry every
  byte on the *latency-sensitive* path in order to save bytes on a background one.
- Per post the extra traffic is one round trip of the recording: ~11 MB egress out of
  Storage (60 s at `VIDEO_BIT_RATE`) plus ~12 MB back in for the merged file and ~0.1 MB
  for the poster. Roughly **+11 GB egress per 1,000 recordings**. Note the external scan
  server already pulls its own copy of every recording today, so this doubles an existing
  per-post egress rather than introducing the first one. Check the current Supabase plan's
  included egress before a volume push.
- The two pulls also **overlap in time**: `markUploaded` enqueues both jobs at once and the
  workers tick independently, so the same object is downloaded twice concurrently, and the
  media worker's ffmpeg shares the API box's CPU with whatever the scan worker is doing.
  Harmless at `workerConcurrency: 1` and V1 volume, but it is the reason the media job is
  not also gated behind scan completion — deliberately, so a stuck scan never withholds a
  poster.
- Reading the input straight from the signed URL (`ffmpeg -i <https…>`) instead of
  downloading first saves disk but not a single byte of transfer, and makes a partial
  read mid-encode harder to retry cleanly. Download, then process.
- The only design that actually removes this traffic is merging on device before the
  upload (see "Deferred"), which costs a hand-written native module on both platforms.
  Not worth it at V1 volume; revisit if egress becomes a real line item.

Because the full video has to come down for the merge anyway, the poster frame and the
blurhash are free — they reuse the file already in the temp dir. Generating the poster on
device instead would save no bandwidth at all; its only benefit is that the grid could
show a still before the merge finishes (see "Deferred").

## Audio alignment

Boogiz passes only `seekTo` to ffmpeg, which is wrong whenever the song is already
playing before the camera rolls — which is exactly our timeline (`record-dance-screen.tsx`):

```
t0                         music.seekTo(musicSeekSeconds(delay)); music.play()
t0 + delayBeforeCountdown  countdown starts (countdownSeconds(bpm))
… + countdownCompletion/2  beginRecording()   ← first video frame
```

So at the first recorded frame the playhead sits at
`musicSeekSeconds(delay) * 1000 + delayBeforeCountdown + countdownCompletionMs(countDown) / 2`,
and real device latency (audio session warm-up, camera start) adds drift on top.

**Read the playhead; do not reconstruct it from wall clock.** The obvious approach —
timestamp `musicPlayer.play()`, timestamp the recording start, subtract — is wrong twice in
this code:

- `recordingStartedAtRef.current = Date.now()` is assigned at `record-dance-screen.tsx:226`,
  *before* `await recorder.startRecording(…)`. Camera start latency, the dominant drift term,
  lands entirely outside the measurement.
- `musicPlayer.play()` (`record-dance-screen.tsx:275`) is a synchronous `void` in expo-audio;
  there is nothing to await, and audio-session warm-up after it returns is unmeasured. The
  error has a sign: measured elapsed time exceeds true playback elapsed, so the merge seeks
  too far and the music runs ahead of the video.

So:

- Mobile captures `musicPlayer.currentTime` at the moment the recording genuinely starts —
  inside the `startRecording` success path, after the failure callback has been ruled out.
  That value is already post-seek and post-latency, so `audioOffsetMs = round(currentTime *
  1000)`; there is no `musicSeekSeconds` term and no `musicStartedAtRef`.
- **Emit `undefined`, never `0`, when the player never started.** `0` is a legitimate offset,
  so it does not reach the fallback below — it muxes the track from its very start instead of
  the beat drop, which is worse than the computed guess it bypassed. Two ordinary paths produce
  exactly that reading: `startDance` swallows seek/play failures in a bare `catch`
  (`record-dance-screen.tsx:275`), and a move with `music?.audioUrl === null` gives
  `useAudioPlayer` no source at all. Gate the capture on
  `musicPlayer.isLoaded && musicPlayer.playing` — both are on `AudioPlayer`
  (`expo-audio/build/AudioModule.types.d.ts:34,50`) — and emit `undefined` otherwise. Null is
  the only value the fallback can recognise.
- **Correct `recordingStartedAtRef` in the same edit — but do not simply move it.**
  `recordingStartedAtRef.current = Date.now()` sits at `record-dance-screen.tsx:226`, *before*
  the `await`, which is why `video_length_s` absorbs the camera-start latency. Re-stamping it
  beside the new `currentTime` read, inside the `if (didFailToStart) return;` guard, fixes
  that — both measurements then share one instant. Relocating it outright does not, and
  introduces a worse bug: `finishRecording` reads that ref and floors a null to `0.1` s
  (`record-dance-screen.tsx:183`), and it is the very callback handed to
  `startRecording(finishRecording, …)`. Today the pre-`await` assignment guarantees the ref is
  set before any callback can fire; with the assignment moved, a `startRecording` promise that
  resolves late — or a recorder that finishes before it resolves — yields a post with
  `video_length_s = 0.1`, which is further from the truth than the inflation being fixed.
  **Keep the pre-`await` stamp as the floor and overwrite it after the guard.** This is the
  root fix for the over-reported duration that §2.2 works around; the `ffprobe` probe there
  stays regardless, because rows recorded before this lands keep the inflated value.
- **The captured offset needs its own ref.** `onRecordingComplete` is invoked from
  `finishRecording`, a `useCallback` closed over its own deps — the `musicPlayer.currentTime`
  read inside `beginRecording` cannot reach it by any other route. Add `audioOffsetMsRef`
  beside `recordingStartedAtRef`, write it at the same instant, clear it in the same places
  (`didFailToStart`, the outer `catch`, and `finishRecording`), and read it when building the
  `RecordedDanceClip`. `undefined` — not `0` — is what an uncleared-but-unset ref must yield,
  per the rule above.
- It travels in `CreateDancePostBody` — `createPost` already runs after the capture, next to
  `videoLength`.
- The server validates it (see §3), stores it in `dance_posts.audio_offset_ms`, and passes it
  to ffmpeg as `-ss`.
- When it is null (older rows, a move with no music, or a music player that never started),
  fall back to a pure `mergeAudioOffsetMs(bpm, delayBeforeAvatarDance)` added to
  `@bnewapp/dance-core` `timing.ts`:

  ```ts
  musicSeekSeconds(delay) * 1000 + delayBeforeTimerMs(delay, bpm) + countdownSeconds(bpm) * 500;
  ```

  The last term is the timeline's `countdownCompletionMs(countDown) / 2` reduced —
  `countdownCompletionMs(s)` is `max(s, 0) * 1000` and `countDown` is already
  `countdownSeconds(bpm)`. Writing it this way keeps `timing.ts` a leaf; importing
  `countdownCompletionMs` from `record-flow.ts` would invert the dependency for no gain.
  Unit-test it against the timeline above.

## 1. Database (new migrations)

`supabase/migrations/<ts>_add_dance_post_media.sql`

```sql
alter table public.dance_posts
  add column merged_video_path text,
  add column thumbnail_path text,
  add column blurhash text,
  add column audio_offset_ms integer,
  add constraint dance_posts_audio_offset_check
    check (audio_offset_ms is null or audio_offset_ms >= 0);

create table public.dance_media_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  owner_id uuid not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_run_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- Composite FK, not `references dance_posts (id)` + a bare owner_id: the original
  -- dance_scans shape allowed the denormalized owner to drift from its post, and
  -- 20260911081328_enforce_dance_scan_owner exists to remove exactly that. The
  -- dance_posts_id_owner_unique target it added is already in place.
  constraint dance_media_jobs_post_owner_fk
    foreign key (post_id, owner_id)
    references public.dance_posts (id, owner_id)
    on delete cascade,
  constraint dance_media_jobs_post_id_unique unique (post_id),
  constraint dance_media_jobs_status_check
    check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint dance_media_jobs_attempts_check check (attempts >= 0)
);

-- Deliberately identical to dance_scans_claim_idx. Note it narrows the claim scan but does
-- not serve the `order by created_at` either worker issues; that is true of the shipped
-- scan index too, and at V1 queue depth it does not matter. Mirror now, measure later.
create index dance_media_jobs_claim_idx
  on public.dance_media_jobs (next_run_at)
  where status = 'pending';

alter table public.dance_media_jobs enable row level security;

create trigger dance_media_jobs_set_updated_at
  before update on public.dance_media_jobs
  for each row execute procedure public.set_updated_at();
```

`supabase/migrations/<ts>_allow_dance_thumbnails.sql` — re-run the bucket upsert with
`allowed_mime_types = array['video/mp4', 'image/jpeg']`. Keep the 45 MB limit, with one
edge accepted: a remux adds only the encoded music, ~960 KB for 60 s at 128 kbps, so an input
recorded at the very top of the limit produces an output just over it and Storage rejects the
upload. The job then fails terminally and the post keeps its original video — today's
behaviour. §2.3 step 4 checks the output size before uploading so that edge costs one
attempt rather than three. Raise the limit only if it is ever actually observed.

Both migrations are additive. `db:push` + `db:types` only after explicit approval, per
`AGENTS.md`.

## 2. Server — `modules/dance`

### 2.1 Persist the offset, then enqueue

`audioOffsetMs` has to be written before anything downstream can read it, and no step in
this plan said where. `routes.ts:99` hands `body.data` straight to the service, so the Zod
field from §3 arrives on its own — but `createPost`'s input type is literally
`{ danceMoveId: string; videoLength: number }` (`service.ts:307`) and its insert
(`service.ts:318-327`) names no such column. Widen both:

```ts
input: { danceMoveId: string; videoLength: number; audioOffsetMs?: number | undefined },
…
audio_offset_ms: input.audioOffsetMs ?? null,
```

Two lines, but they are the only link that persists the value the whole "Audio alignment"
section exists to compute. Without them the column stays null forever and every merge
silently takes the fallback path — which still produces a plausible-looking video, so
nothing fails loudly. Cover it with a `createPost` test, not just the Zod bound.

In `service.ts:markUploaded`, next to the existing `dance_scans` upsert, upsert a
`dance_media_jobs` row (`onConflict: "post_id", ignoreDuplicates: true`). A failure to
enqueue media must **not** fail the request that already queued the scan — log and continue.

Fail-soft on its own loses the post forever: nothing re-enqueues it and the client never
retries `markUploaded`. So the worker tick also **sweeps for orphans** — posts with
`status != 'uploading'`, a non-null `video_path`, a null `merged_video_path`, and no
`dance_media_jobs` row — and inserts the missing job (bounded per tick, oldest first).
That sweep is the enqueue's recovery path *and* the backfill listed in §7; one mechanism
covers both, so §7 keeps only the one-off trigger decision.

The "no job row" half is what keeps the sweep finite, and it is load-bearing twice: a post whose
move has no music never gets a `merged_video_path`, and a terminally `failed` job never gets one
either — both are excluded only because their job row exists. Never relax that predicate to
`merged_video_path is null` alone.

Two things the sweep needs stated, because neither is expressible by accident:

- **It is an anti-join, and PostgREST has no `LEFT JOIN … IS NULL`.** Write it as a left embed —
  `.select("id, owner_id, dance_media_jobs!left(post_id)").is("dance_media_jobs", null)` — or as
  a SQL RPC. Reaching for `.not("id", "in", …)` over a subquery, or filtering client-side after
  pulling the page, turns a bounded recovery path into a scan of the whole history.
- **It must not run on every tick.** The tick is 2 s and `dance_posts` only grows, so an
  unconditional sweep is a permanent 0.5 Hz anti-join over the full table for an event that
  should be rare. Run it every Nth tick and bound it to posts created within a recent window;
  the one-off backfill in §7 covers anything older.
- **The sweep's write is an upsert, not an insert.** It races `markUploaded` against
  `dance_media_jobs_post_id_unique` — a post uploaded between the sweep's read and its write
  is enqueued twice. Use the same `{ onConflict: "post_id", ignoreDuplicates: true }` the
  enqueue above does, so the loser is a no-op instead of a thrown constraint violation that
  aborts the rest of the batch.

### 2.2 ffmpeg step (`modules/dance/media-processor.ts`)

Pure-ish module with no Supabase knowledge: takes local paths, returns local paths.
Run binaries with `execFile` from `node:child_process` (argument array, never a shell),
each with a hard timeout, writing into a per-job directory under `os.tmpdir()` that is
removed in a `finally`.

Name note: `modules/admin/dance-media-service.ts` already exists and owns *catalog* media
(move artwork and reference clips, sharp-resized on upload). This module is post media and
lives under `modules/dance/`; keep the two clearly apart in naming and imports.
`processDanceMediaImage` there is the closest in-repo sharp pipeline — read it alongside
`catalog/art.ts`.

```
# merge — video stream copied, only the music is encoded.
# -ss sits *between* the two inputs deliberately: it is an input seek applied to <music>.
# -fflags/-max_interleave_delta are output-side and must precede <merged.mp4>; see below.
ffmpeg -y -i <video.mp4> -ss <audioOffsetSeconds> -i <music> \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 128k -af apad -shortest \
  -fflags +shortest -max_interleave_delta 100M \
  -movflags +faststart <merged.mp4>

# poster frame (posterSeconds derived from the probed duration — see below)
ffmpeg -y -ss <posterSeconds> -i <video.mp4> -frames:v 1 -q:v 3 <thumb.jpg>
```

Notes:
- `-ss` **before** `-i <music>` is an input seek (fast, keyframe-accurate enough for a
  music bed — mp3 seeks land on a frame boundary, under ~26 ms of error).
- **`-af apad` is not optional.** `-shortest` cuts at the *shorter* stream, and the audio
  has been seeked forward by `audioOffsetMs`. Recording length is
  `floor(referenceDuration) + 1` (`record-dance-screen.tsx:109-112`), so any track with
  less than `offset + recordingLength` remaining — entirely plausible for a track sized to
  the choreography — would truncate **the dance**, not just the music. `apad` pads the
  audio with silence so `-shortest` lands on the video length.
- `-shortest` is unreliable with `-c:v copy` on some ffmpeg builds — it can be evaluated
  after the copy stream has already been flushed, producing a file padded to the *audio*
  length instead. `-fflags +shortest -max_interleave_delta 100M` corrects it. **Both are
  output-side flags and must sit after the `-map`s and before the output path**, as in the
  block above — put them ahead of the first `-i` and they apply to the input demuxer, where
  they do nothing and fail silently. §2.5 asserts their presence in `buildMergeArgs`; assert
  their *position* too. Verify output duration against input duration on the pinned
  `ffmpeg-static` build in milestone 2.
- `-movflags +faststart` moves the moov atom to the front so the merged file streams.
- A move with `music.audioUrl === null` skips the merge and produces only the poster.
- If `ffprobe` reports a non-H.264 video stream, log and skip the merge rather than
  silently transcoding. `ffprobe` comes from `ffprobe-static`, a second dependency —
  see §5; `ffmpeg-static` does not ship it.
- **Do not assume the music is mp3.** `music_tracks.audio_url` is an admin-supplied
  `requiredUrl` (`admin/dance-content-schemas.ts:20`), not a bucket object with an enforced
  mime type, so it can be m4a/aac/wav. Download it to an **extensionless** temp path and let
  ffmpeg probe the container; naming it `music.mp3` invites a wrong demuxer guess. The
  "~26 ms seek error" figure above and the "~960 KB at 128 kbps" size estimate in §1 are
  mp3-specific — treat them as order-of-magnitude, not guarantees. The `-c:a aac` output is
  unaffected either way.
- **Clamp `-ss` against the track, not just against a constant.** §3's
  `AUDIO_OFFSET_CEILING_MS` bounds what a client may send; nothing compares the value to the
  actual music duration. Seeking past EOF yields an empty audio stream, and `apad` on an
  empty stream combined with `-shortest` is build-dependent — a silent-but-present track, a
  non-zero exit, or a mis-padded file. This is reachable without a malicious client: a short
  track paired with a large `delay_before_avatar_dance`. `ffprobe` the music alongside the
  video and use `min(offsetSeconds, max(musicDuration - 1, 0))`, falling back to `0`.
- The poster seek must degrade: `finishRecording` floors the duration at 0.1 s
  (`record-dance-screen.tsx:183`), so a fast stop produces a sub-second file where `-ss 1`
  yields no frame, ffmpeg exits non-zero, and the job burns all three attempts on a clip
  that will never succeed. Pick `min(1, duration / 2)` — but take `duration` from
  `ffprobe` on the downloaded file, **not** from `video_length_s`. §"Audio alignment" moves
  the `recordingStartedAtRef` assignment after the `await`, which stops *new* rows inflating by
  the camera-start latency — but every row recorded before that lands still over-reports, and
  those are exactly the clips the guard has to fire on. The file is already on disk, so the
  probe is free and correct for both eras. Keep a fall back to `-ss 0` on a first-attempt
  failure as the second line of defence.

Argument construction is a pure `buildMergeArgs()` / `buildPosterArgs()` returning
`string[]`, so the `-ss` / `-map` / `apad` ordering is unit-testable without spawning
anything (§2.5 injects the processor, which would otherwise leave argv covered only by a
staging deploy).

Blurhash: read the produced JPEG with sharp, **resizing before the raw read**, then
`encode` from the `blurhash` package with the same 4×4 component count Boogiz uses:

```ts
const { data: pixels, info } = await sharp(posterPath)
  .resize(32, 32, { fit: "inside" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const blurhash = encode(new Uint8ClampedArray(pixels), info.width, info.height, 4, 4);
```

The dimensions must come from `info`, never from the resize arguments: `fit: "inside"`
preserves aspect ratio, so a 16:9 poster comes back **32×18**, and `encode(pixels, 32, 32,
…)` would read past the buffer. `apps/server/src/modules/catalog/art.ts:88` already uses
exactly this `resolveWithObject` + `info.width` / `info.height` idiom — follow it whole.

The resize itself matters for a different reason: `encode` is pure JS on the main thread,
and handing it a 1280×720 frame is ~920k pixels of event-loop block on a shared Railway
CPU for a result that is visually identical at 32px.

### 2.3 Worker (`modules/dance/media-worker.ts`)

Mirror `scan-worker.ts`: interval tick, reap locks older than the job timeout plus a
grace window, count in-flight rows against `concurrency`, claim with a conditional
`UPDATE`, retry with exponential backoff to `MAX_ATTEMPTS`, then mark `failed`.

Per claim:
1. Load the post: `video_path`, `audio_offset_ms`, `dance_moves(bpm)`, and the track
   joined **through `dance_posts.music_id`** — `music_tracks!dance_posts_music_id_fkey
   (audio_url, delay_before_avatar_dance)` — not through `dance_moves.music_tracks`.
   `createPost` freezes `music_id` onto the post at record time, and `modules/admin` can
   repoint a move at a different track afterwards. Reading the move's *current* track would
   mux a song the dancer never heard and feed the §"Audio alignment" fallback the wrong
   `delayBeforeAvatarDance`. The post's own `music_id` is the only correct source; a null
   one means no music and skips the merge.
2. Sign a short-lived read URL for the original and download it, plus the music track,
   into the job temp dir. **Stream to disk** — `Readable.fromWeb(response.body).pipe(
   createWriteStream(…))`, not `await response.arrayBuffer()`, which spikes the whole
   ~11 MB into the heap. Give every fetch an `AbortSignal.timeout` and every `execFile` a
   `timeout`; with `workerConcurrency: 1` and the tick's `isTicking` guard, one hung
   Storage read otherwise stalls the entire queue until the reap window expires. Clamp
   `audio_offset_ms` again here before it reaches argv — first to `AUDIO_OFFSET_CEILING_MS`
   (the Zod bound in §3 is the boundary check, this is the defence in depth) and then to the
   probed music duration per §2.2. The second clamp is not redundant: only the worker knows
   how long the track actually is.
3. Run merge + poster, compute the blurhash.
4. `stat` the merged file and skip the upload if it exceeds the bucket's 45 MB limit,
   failing the job terminally in one attempt. The overflow described in §1 is deterministic,
   so without this check it burns all three attempts and re-downloads ~11 MB each time to
   reach the same rejection. Then upload `<ownerId>/<postId>-merged.mp4` and
   `<ownerId>/<postId>.jpg` with `upsert: true`
   **and an explicit `contentType`** (`"video/mp4"` / `"image/jpeg"`). supabase-js infers
   `application/octet-stream` from a Buffer or stream, and the bucket enforces a mime
   allowlist, so an inferred type is a hard rejection rather than a mislabelled object. Every
   server-side upload in the repo already passes one (`admin/catalog-service.ts:162`,
   `admin/dance-media-service.ts:146`); follow that.
5. Update `dance_posts` with the two paths and the blurhash, then mark the job
   `completed`.

Terminal failure leaves the post untouched: it keeps playing the original silent video,
which is exactly today's behaviour. Re-running a partially applied job is safe because both
uploads use `upsert: true` and the `dance_posts` update is a straight overwrite.

The same music track is re-downloaded once per post, and a handful of tracks will dominate
the catalog. That is accepted at V1 volume — no cache — and is the first thing to revisit if
the job's wall time becomes interesting.

### 2.4 Config & wiring

Extend `modules/dance/config.ts`:

```ts
export const DANCE_MEDIA_CONFIG = {
  danceVideoBucket: DANCE_SCAN_CONFIG.danceVideoBucket,
  workerConcurrency: 1,
  workerEnabled: true,
  downloadTimeoutMs: 30_000,
  ffmpegTimeoutMs: 60_000,
  uploadTimeoutMs: 30_000,
} as const;
```

`jobTimeoutMs` is **derived**, not configured: it is the sum of the per-step budgets above
(two downloads, two ffmpeg runs, two uploads), and the reap window is that sum plus the
grace period. `scan-worker.ts` gets its window the same way, from
`createScanningClient(...).maxDurationMs + STUCK_LOCK_GRACE_MS`. A hand-picked
`jobTimeoutMs` that nothing enforces is a number that drifts away from what the job
actually does.

Worth multiplying that out once, because it is the number anyone debugging the queue will want:
two downloads, two ffmpeg runs and two uploads at the budgets above sum to **240 s**, so the reap
window is ~5 min with the grace period. With `workerConcurrency: 1` and the tick's `isTicking`
guard, a single wedged job stalls the entire media queue for that long — and a replica that dies
mid-job leaves its row unclaimable until the window expires. Acceptable at V1 volume; it is the
first number to revisit if the queue ever backs up.

The bucket is referenced, not re-spelled: `app.ts:81` already threads
`DANCE_SCAN_CONFIG.danceVideoBucket` into the routes, and two literals that must agree are
two literals that eventually will not.

Register in `app.ts` beside `startScanWorker` (the exported wiring helper — `app.ts:75`;
`createScanWorker` is the inner factory), under the same `config.NODE_ENV !== "test"` guard.
Concurrency 1 is deliberate: one remux at a time is enough for V1 volume and leaves the
API's CPU alone. `ffmpeg` is a separate process, so it never blocks the Node event loop — it
only shares CPU.

Note that the budget is **per replica**. Claims are conditional updates and stay correct
under multi-replica, but "one remux at a time" becomes N with N replicas. If the Railway
service scales out, that is the number to reason about — not `workerConcurrency` alone.

### 2.5 Tests (Vitest, `apps/server/tests`)

- `createPost` persists `audioOffsetMs` to `dance_posts.audio_offset_ms`, writes null when
  the field is absent, and still writes a literal `0` as `0`.
- `markUploaded` enqueues both a scan and a media job; a media enqueue failure still
  returns success and still queues the scan.
- The orphan sweep enqueues a job for a post that has a `video_path`, no
  `merged_video_path`, and no job row — and enqueues nothing for a post that already has
  one, or for one still `uploading`. Cover the two rows that stay `merged_video_path`-null
  forever: a music-less post with a `completed` job and a post with a terminally `failed` job
  are both skipped, so the sweep cannot loop on them.
- Worker claim is atomic (two ticks never process the same row twice) and a stuck
  `processing` row past the lock window is reaped.
- Retry/backoff path, and terminal `failed` after `MAX_ATTEMPTS` leaves
  `merged_video_path` null.
- The music track is resolved from `dance_posts.music_id`: a post whose move has since been
  repointed at a different track still merges the track recorded against.
- A post with a null `music_id` produces a thumbnail + blurhash and no merged path.
- Media processing is injected (like `ScanWorkerOptions.scan`) so tests never spawn ffmpeg.
- `buildMergeArgs` / `buildPosterArgs`: argv ordering; `-af apad` present; `-fflags +shortest`
  and `-max_interleave_delta` present **and positioned after the `-map`s, before the output
  path**; offset clamped to both `AUDIO_OFFSET_CEILING_MS` and the probed music duration
  (an offset beyond the track collapses to the clamped value, never to a seek past EOF);
  music-less post produces poster args only; sub-second probed duration drops the poster seek.
- The merged output is not uploaded when it exceeds the bucket limit, and that job fails
  terminally on its first attempt rather than retrying.
- Blurhash encoding passes the *resized* dimensions: a 16:9 source yields a hash computed
  at 32×18, and the call never uses the resize arguments as the encode dimensions.
- Both derived uploads pass an explicit `contentType`.
- Signing a page zips results back by `path`: a `createSignedUrls` response returned out of
  input order still lands each URL on its own row, an entry with a null `path` is skipped
  rather than collapsed onto another row, and a per-path error nulls only the derived field
  while a failure on `video_path` still throws.
- `packages/dance-core`: unit tests for `mergeAudioOffsetMs` across null bpm, null delay,
  and `delay < countdown`.

### 2.6 Optional follow-up

Once both workers are green, consider extracting the shared claim/reap/backoff loop into
`modules/dance/job-queue.ts`. Separate commit, no behaviour change.

## 3. Types (`packages/types`)

```ts
export interface CreateDancePostBody {
  danceMoveId: string;
  videoLength: number;
  // `| undefined` is load-bearing: tsconfig.base.json sets exactOptionalPropertyTypes,
  // so a bare `?: number` cannot be assigned an explicit `undefined`, and mobile reaches
  // `createDancePost` with a parsed-or-missing param.
  audioOffsetMs?: number | undefined;
}

export interface DancePostHistoryItem extends DancePost {
  videoUrl: string;
  mergedVideoUrl: string | null;
  thumbnailUrl: string | null;
  /** Stable storage path behind `thumbnailUrl`; the signed URL rotates, this does not. */
  thumbnailPath: string | null;
  blurhash: string | null;
}
```

`DancePostDetail` extends `DancePostHistoryItem`, so the detail route inherits the three
fields with no further change.

Three pieces of server plumbing this implies, none of which are optional:

- **Validate `audioOffsetMs` at the boundary.** It is client-supplied and ends up as an
  ffmpeg `-ss` argument, so a DB `check (>= 0)` is not enough — `AGENTS.md` puts validation
  at the edge. Add it to `CreateDancePostRequest`
  (`apps/server/src/modules/dance/schemas.ts:19`) as
  `z.coerce.number().int().min(0).max(AUDIO_OFFSET_CEILING_MS).optional()`, with the ceiling
  set from the longest plausible track rather than left open.
- **Extend `DANCE_POST_SELECT`** (`service.ts:99-100`) and the `Pick<>` in `toDancePost`
  with `merged_video_path`, `thumbnail_path`, `audio_offset_ms` and `blurhash`.
  `withSignedVideoUrl` cannot sign paths the query never selected.
- **Sign a page in one call.** `listPosts` is already parallel across rows
  (`Promise.all(pageRows.map(withSignedVideoUrl))`, `service.ts:273`); adding two more paths
  per row turns 18 concurrent Storage calls into 54. Collect every path for the page and
  issue a single `createSignedUrls(paths, ttl)`, then zip the results back onto the rows.
  `createSignedUrls` returns a per-path `{ error, path, signedUrl }` array, so a missing
  derived object degrades to a null field instead of failing the page — which is what the
  nullable DTO already promises. Three details are not optional: **dedupe** the path list,
  **zip back by the returned `path`, never by array index** (a mis-indexed zip hands one user's
  row another row's signed URL, and nothing in the types would catch it), and keep `videoUrl`
  **fail-hard** as `withSignedVideoUrl` does today — `DancePostHistoryItem.videoUrl` is a
  non-nullable `string`, so only `mergedVideoUrl` and `thumbnailUrl` may degrade to null.
  One typing detail the zip has to survive: supabase-js declares the response `path` as
  `string | null`, so an entry that errored can come back keyless. Skip null paths explicitly
  rather than letting them collapse into a shared `undefined` bucket — that is the same
  mis-attribution the zip-by-path rule exists to prevent, arriving through the type system
  instead of through array order.
- **Return `thumbnailPath` alongside `thumbnailUrl`.** The signed URL rotates on every
  request, and `expo-image` keys its cache on the URL — see §4; the client needs the stable
  storage path to use as a `cacheKey`.

## 4. Mobile (`features/dance`)

- **Thread `audioOffsetMs` through the whole hand-off, not just the mutation.** The clip
  crosses a *navigation*: `record.tsx:14-19` serializes `{ clipPath, clipDuration }` into
  router params and `/dance/[moveId]/result` reconstructs it. Every hop needs the new field:
  `RecordedDanceClip` (`record-dance-screen.tsx:41`) → `onRecordingComplete` payload →
  `record.tsx` router params (as a string, like `clipDuration`) → the result route's param
  parse → `SubmitDanceRecordingInput` / `submitDanceRecordingMutationAtom`
  (`_atoms/mutations.ts`) → `createDancePost`. Treat a missing or unparseable param as
  absent and let the server fall back. Per §"Audio alignment", the capture emits `undefined`
  rather than `0` when the music player never loaded, and the same edit moves the
  `recordingStartedAtRef` assignment after the `await`. `0` must survive the round trip as a
  real value, so the param parse cannot use a falsy check to mean "absent". The list above
  starts at `RecordedDanceClip` deliberately — the hop *before* it, from `beginRecording` to
  `finishRecording`, goes through `audioOffsetMsRef` rather than an argument; see
  §"Audio alignment".
- `dance-post-grid.tsx`: replace the per-cell `useVideoPlayer` with `expo-image`
  (`source={{ uri: thumbnailUrl, cacheKey: thumbnailPath }}`, `placeholder={{ blurhash }}`),
  keeping the current video cell only as the fallback while `thumbnailUrl` is still null.
  This removes up to N mounted video players from the Profile grid — the main perf win of
  this plan, independent of the audio work. No `react-native-blurhash` dependency:
  `expo-image` takes a blurhash placeholder natively. Note this is **two sibling cell
  components**, not a conditional inside `DancePostCell`: `useVideoPlayer` is a hook and
  cannot be called conditionally.
- **`cacheKey` is not a micro-optimization — without it the perf win largely evaporates.**
  `dance-videos` is private, so every `listPosts` mints a fresh signed URL for the same
  object. `expo-image` keys its memory and disk cache on the URI, so an unkeyed poster is
  re-downloaded on every refetch, pull-to-refresh, and remount: 18 JPEG fetches to avoid
  18 video players. `cacheKey` (`expo-image` `ImageSource.cacheKey`) pins the entry to the
  stable storage path, so the rotating URL is only ever a fetch address. The alternative —
  a second, public posters bucket with permanent URLs — is simpler at the client but gives
  up the "no object is reachable without a signed URL" property the private bucket was
  created for (`20260912174500`). **Decision: keep the private bucket, use `cacheKey`.**
- `dance-post-detail-screen.tsx`: play `mergedVideoUrl ?? videoUrl`. `VideoView` has **no**
  `poster` or `placeholder` prop (verified against the installed
  `expo-video/build/VideoView.types.d.ts`), so the poster is an `expo-image` overlaid on
  the player and dismissed on the first rendered frame — not a prop.
- The result screen keeps polling the score only; media readiness is never awaited.
- Tests: grid renders the image cell when a thumbnail exists and the video cell when it
  does not; the image cell passes `cacheKey` so a rotated signed URL does not change the
  cache identity; the submit mutation forwards `audioOffsetMs`; the record → result param
  round trip preserves it, including a literal `0`; the capture emits `undefined` when the
  music player is not loaded or not playing.

## 5. Deployment

- Add `ffmpeg-static`, **`ffprobe-static`** and `blurhash` to `apps/server`. Resolve both
  binary paths from their package exports, never from `PATH`.
- **`ffmpeg-static` ships the `ffmpeg` binary only.** `ffprobe` is a separate package, and
  §2.2 depends on it three times — the poster-seek duration guard, the H.264 codec gate, and
  the music-duration clamp. Omitting it passes on any dev machine with
  a Homebrew ffmpeg on `PATH` and fails on Railway, which is exactly the case the staging
  check below exists to catch. Scraping `ffmpeg -i` stderr for duration and codec avoids the
  second dependency at the cost of parsing human-readable output; prefer the real binary.
- Railway (glibc x64) runs its own install, so the platform binaries are fetched at build
  time like `sharp`'s. Verify on a staging deploy that **both** binaries are executable and
  that `/tmp` is writable in the container.
- Disk: each job writes ~25 MB of temporaries and deletes them in a `finally`; with
  concurrency 1 the working set stays trivial.
- Multi-replica safe: claims are conditional updates, identical to the scan worker.

## 6. Milestones

1. **Migrations + types + `mergeAudioOffsetMs`** — schema, DTO fields, the
   `CreateDancePostRequest` bound, the `createPost` insert of `audio_offset_ms` (§2.1), the
   widened `DANCE_POST_SELECT`, dance-core helper and its tests. No behaviour change, but the
   insert is what makes milestone 2 observable — ship it here, not later.
2. **Media processor + worker + the offset capture** — `ffmpeg-static` **and
   `ffprobe-static`** wired and verified on staging (§5), ffmpeg/blurhash module, worker,
   enqueue in `markUploaded`, server tests, *and* the mobile capture/threading of
   `audioOffsetMs` (§4, first bullet) with the `recordingStartedAtRef` move. The capture ships
   here rather than in milestone 3 on purpose: without it, staging has nothing but the computed
   fallback to verify, and the device-latency correction that §"Audio alignment" exists for
   would go untested until the last milestone. Exit criterion: merged files from a real device
   recording play with sound and in sync.
3. **Mobile consumption** — poster/blurhash grid, merged playback in the detail screen, tests,
   device verification.
4. **Optional** — extract the shared queue loop.

## 7. Deferred

- Backfill for posts recorded before this lands. The §2.1 orphan sweep already enqueues
  them on its own, so what is deferred is only the *pacing* decision: let the sweep drain
  the history slowly at its per-tick bound, or run a one-off script to enqueue them all at
  once. `audio_offset_ms` is null for every such row, so they use the computed fallback.
- Device-side poster frame via `expo-video`'s `generateThumbnailsAsync` (+ a file write,
  which neither `expo-image` nor `expo-video` exposes for a `SharedRef` image today, so it
  needs `expo-image-manipulator`). Saves no bandwidth — only makes the poster available
  before the merge job finishes.
- Watermarking, shareable export, and any AI-avatar stitching — the parts Boogiz pushed
  to SQS workers. If those ever land, that is the point to reconsider an external
  worker (a separate Railway service consuming the same table first, and only then a
  managed queue).
- HLS/adaptive playback; progressive MP4 is fine at this size.

## 8. Open questions

All four carry a proposed answer; review concurred with each and none is blocking. They are kept
open for owner sign-off, not because the trade-off is still undecided. The last one's proposed
answer is "do it now", so it needs a decision before milestone 2 rather than after shipping.

- Should a terminal media failure surface anywhere in the UI, or stay silent (the post
  simply keeps the original video)? Proposed: silent, with a server log + metric.
- Nothing invalidates the posts query when a media job completes. The result screen polls
  the score only, so a post recorded a moment ago renders the video-player cell and only
  upgrades to poster + blurhash on the next pull-to-refresh or tab remount. Proposed:
  accept it — the fallback cell is today's behaviour and the window is one job — but it is
  a decision, not an oversight. The alternative is extending the existing score poll to
  also watch `thumbnailUrl`, which keeps a screen polling for something cosmetic.
- Retention: keep the original after a successful merge (cheap insurance, doubles
  storage) or delete it once the scan has completed? Proposed: keep for now, revisit when
  storage cost is measurable.
- Derived-object cleanup. `discardUploadingPost` removes only `video_path`, and it only fires
  pre-upload, so nothing deletes `<postId>-merged.mp4` / `<postId>.jpg` if a post is ever
  removed. Harmless today (posts are not deletable), which is exactly why this is cheap now
  and expensive later. **Proposed: settle it in this plan rather than defer it** — add a
  `derivedObjectPaths(ownerId, postId)` helper next to the worker's upload step and call it
  from `discardUploadingPost`, so the single place that knows the derived naming scheme is
  also the place any future deletion path will find. The retention question above is
  genuinely open; this one is only open because nobody has written the three lines.
