# Catalog asset statistics — Tier A, 2026-09-24

Tier A of the measurement plan in [the video playback plan](video-playback.md): the two
measurements that touch neither app. **A1 is complete and answers decision 4.**
**A2 cannot be answered from the available database** — see the last section.

> **Corrected after the first pass.** The first run of A1 probed the URLs stored in the
> `dance_moves` columns and concluded the catalog lives on legacy Boogiz S3. That is what the
> *columns* say, but it is not where the catalog lives: the media has been migrated into the
> Supabase `dance-media` bucket, and every published move has a complete copy there. The
> numbers below are re-measured against the Supabase objects. What the stored URLs are still
> pointing at is itself a finding, kept as *The rows were never repointed*.

Encoding quality is fine: every sampled asset is H.264 High / yuv420p at a sane resolution and
bitrate. The problems are `moov` placement, cache headers, and frame rate — none of which the
migration changed, because it copied the files rather than re-encoding them.

## Conditions and method

- One Supabase project is configured across the whole repo (`apps/server/.env`,
  `apps/mobile/.env`, `apps/edu/.env`, `apps/admin/.env.local` and the linked project in
  `supabase/.temp/project-ref` all agree). Everything below was read from it with the server's
  secret key.
- `dance_moves`: **1,086 rows, 808 `published`**.
- `dance-media/moves/`: **1,099 folders**, of which 1,086 match a `dance_moves.legacy_id` and 13
  are orphans. Storage is keyed by `legacy_id` (the Mongo ObjectId), not by the row's uuid.
- Object set under test: for each published move, the `main`, `pro-dancer`, `dancer-tip`,
  `presentation` and `film-yourself` video present in its folder → **3,829 objects**, addressed
  as `…/storage/v1/object/public/dance-media/moves/<legacy_id>/<name>`.
- **Header pass (all 3,829):** one HTTP `HEAD` each.
- **`moov` placement pass (all reachable):** top-level MP4 boxes walked with 16-byte `Range`
  reads, so `moov` before `mdat` (`+faststart`) is decided without downloading the files.
- **Codec pass (200-object stratified sample):** `ffprobe -show_format -show_streams` over HTTP,
  40 published objects per role, evenly spaced over each role's sorted URL list (deterministic).
- **Keyframe pass (50-clip sub-sample):** keyframe positions from **packet flags**
  (`-show_entries packet=pts_time,flags`), not from `-skip_frame nokey`. On this corpus frames
  carry no `pts_time`, so the frame-based method reports one keyframe for every clip; the packet
  method was verified against three files downloaded locally.

## Results

### The rows were never repointed

The files are on Supabase. The database still points at Boogiz:

| Column | Rows whose URL is a Supabase URL |
| --- | ---: |
| `main_video_url`, `pro_dancer_video_url`, `dancer_tip_video_url`, `presentation_video_url`, `film_yourself_video_url`, `thumbnail_url` | **0 of 1,086, each** |

All 5,127 distinct URLs in those columns are on `boogiz.s3.eu-central-1.amazonaws.com` or
`boogiz-avatar.s3.eu-central-1.amazonaws.com`. `service.ts:toDanceMove` passes
`row.main_video_url` straight through with no rewrite, so **the apps are serving the legacy S3
copies today**, not the migrated ones — including the Stepz feed, whose source
`resolvePreviewMedia` resolves to `mainVideoUrl`.

The migration is otherwise complete for the published catalog:

| Check | Result |
| --- | ---: |
| Published moves with a storage folder | **808 / 808** |
| Published moves with a `main.*` in storage | **808 / 808** |
| Published `pro-dancer` videos in storage | 598 / 808 |

That 598 is exactly 808 − 210, and 210 is the number of published moves whose *Boogiz*
`pro_dancer_video_url` returns HTTP 403. The migration copied what it could reach and skipped
what was already broken at source, so **the 210 are moves needing re-upload, not a regression**.
They matter today only because the rows still point at the dead S3 objects, which
`learn-dance-screen.tsx:173` plays in its "Pro dancer" tab.

### Delivery headers — a CDN that is told not to cache

3,829 objects probed; 3,828 returned 200 and one returned 504.

| Header | Result |
| --- | --- |
| `content-type` | **`video/mp4` on 3,828** (correct; the Boogiz copies serve `binary/octet-stream`) |
| `server` | `cloudflare` on all — Supabase's Smart CDN is in front |
| **`cache-control`** | **`no-cache` on all 3,829** |
| `cf-cache-status` | **`MISS` on all 3,828** |

This is the one place the migration lost ground. `dance-media-service.ts:147` and
`media-upload-input.tsx:150` both set `cacheControl: "31536000, immutable"`, so anything uploaded
through **admin** is correct — but the legacy corpus did not come through admin, and Supabase's
default for an upload with no `cacheControl` is `no-cache`. The result is a CDN in front of
every object that is instructed never to serve from cache: 3,828 requests, 3,828 misses.

Re-uploading is not required to fix it; the object's `cacheControl` metadata can be updated in
place.

### `moov` is at the end of 98.3 % of the corpus

| Box order | Objects | Meaning |
| --- | ---: | --- |
| `ftyp > free > mdat` | 3,760 | `moov` at the end — **no faststart** |
| `ftyp > moov` | **66** | faststart |

| Role | Published objects | faststart |
| --- | ---: | ---: |
| `main` | 808 | **0** |
| `dancer_tip` | 807 | **0** |
| `presentation` | 808 | **0** |
| `film_yourself` | 808 | 8 |
| `pro_dancer` | 598 | 58 |

`resolvePreviewMedia` prefers `main`, which is **0 % faststart**. Every video the Stepz feed
plays forces the player to fetch the end of the file before it can decode a single frame — an
extra round trip on every first play of every page, and behind a CDN that is currently told not
to cache either request.

This is inherited, not introduced: the Boogiz originals are 4.4 % faststart and the migration
copied the bytes.

### Codec and encoding — clean, except the frame rate

200-object stratified sample, all 200 probed without error:

| Property | Distribution |
| --- | --- |
| Video codec | **h264 200/200** |
| Profile | High 199 · Main 1 |
| Pixel format | **yuv420p 200/200** |
| Resolution | 720×1280 (159) · 720×1440 (23) · 720×1260 (12) · 1080×1920 (5) · 768×1536 (1) |
| **Frame rate** | **60 fps (174) · 30 fps (26)** |
| Audio | aac (170) · **no audio track (30)** |
| Encoder tag | `Lavf58.68.100` (194) · absent (6) |

| Measure | p25 | median | p75 | p90 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Duration (s) | 7.4 | **9.6** | 12.0 | 32.9 | 82.9 |
| Format bitrate (Mbps) | 0.85 | **1.20** | 1.49 | 1.92 | 17.65 |

**87 % of the corpus is 60 fps.** That doubles decode work per second against a 30 fps
assumption, on the one platform where concurrent-decoder count is the binding constraint, and it
is the largest input to the Pixel adaptive-refresh question that no available hardware can test.

### Keyframe interval — 4.17 s, not the 2 s the plan assumed

50-clip sub-sample, packet-flag method:

| Measure | Result |
| --- | --- |
| Median GOP, p10 / p50 / p90 | 3.800 s / **4.167 s** / 8.333 s |
| Clips whose median GOP exceeds 2 s | **48 / 50** |
| Clips with a single keyframe | 0 / 50 |

4.167 s is 250 frames at 60 fps — FFmpeg's default `-g 250`, consistent with the
`Lavf58.68.100` encoder tag and no explicit GOP setting at the original ingest. The plan argued
that a 2 s keyframe interval (`-g 60`) is already too sparse for a surface that loops sections,
changes rate and scrubs. The real corpus is twice that again.

> **Method correction.** An earlier run used `-skip_frame nokey -show_entries frame=pts_time` and
> reported *one keyframe per clip* across the whole sample. That is an artifact: frames in this
> corpus carry no `pts_time`, so every keyframe timestamp came back empty. Three files downloaded
> locally showed 12, 3 and 1 keyframe packets respectively, and the packet-flag method reproduces
> that over HTTP. Only the packet-flag numbers are real.

## A2 — the `skippedMergeReason` rate is not answerable here

`skippedMergeReason` is still only logged (`media-worker.ts:161-165`), never persisted, but a
proxy exists without a new column: a `dance_media_jobs` row that is `completed` while its post's
`merged_video_path` is null is a skipped merge, and `music_id` separates "no music track" from
"unsupported video codec".

The proxy returns nothing usable, because this database has almost no user content:

| Measure | Count |
| --- | ---: |
| `dance_media_jobs` rows | **5** (all `completed`; 0 failed, pending or processing) |
| `dance_posts` rows | 12 |
| Posts with `merged_video_path` | 5 |
| Posts with a null `music_id` | 0 |

Five for five merged, zero skips — at n=5, that is not a rate. **Record A2 as unmeasured, not as
passed.** Answering it needs a database with real volume, or the additive `skipped_merge_reason`
column so the question becomes SQL once volume exists. `media-processor.ts:238` already emits
`unsupported video codec: <name>`, so the answer would identify the offending devices too.

## What this changes in the plan

1. **Decision 4 is answered.** Codec, profile and pixel format are uniform and universally
   decodable; resolution and bitrate are sane; durations are short (median 9.6 s). Phase 3's
   *transcode-for-compatibility* motivation is gone.
2. **Phase 3 keeps its place with different content.** Three ingest-side defects survive the
   migration untouched: `+faststart` on 98.3 % of the corpus, a ~4.2 s GOP on the practice
   assets, and the 60 fps question.
3. **`+faststart` is the cheapest large win available, and it is not in the ladder.** It is a
   stream copy (`ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`), needs no app change,
   and targets exactly the surface the pilot measures. Rung 0 hides the blank frame; this removes
   a cause of it. Sequence it *beside* rung 0.
4. **Two migration follow-ups are outstanding, both cheap and neither a code change.** Repoint the
   `dance_moves` URL columns at the Supabase objects, and set `cacheControl: "31536000, immutable"`
   on the migrated objects so the Cloudflare layer in front of them can actually cache. Until the
   first is done, the apps — and any measurement taken against them, including the existing
   feed baselines — are exercising the Boogiz copies.
5. **Rung 2's premise is sound once the headers are fixed.** `expo-video`'s device cache keys on
   the URL and does not need `cache-control`, so `useCaching` works either way; but the edge-cache
   benefit Phase 2 assumes does not exist while every object says `no-cache`.
6. **60 fps raises the decoder budget.** The ~4-decoder Android ceiling was reasoned about at an
   implied 30 fps. Three concurrent 60 fps 720p decoders is the real feed load.
7. **Rung 0 is unblocked on the data side:** all 808 published moves have a `thumbnail_url`, so
   the poster overlay always has something to show.
8. **210 published moves need their pro-dancer video re-uploaded.** Known and expected — they are
   the moves the migration could not copy because the source 403s. Unrelated to playback
   performance.

Still open in Phase 0: the physical iPhone baseline, throttled-network runs, the lesson/practice
surface, decoder counts, the `surfaceView`/`textureView` comparison, and the Pixel 9/10
refresh-rate check that no available hardware can run.
