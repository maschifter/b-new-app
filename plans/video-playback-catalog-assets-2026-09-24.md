# Catalog asset statistics — Tier A, 2026-09-24

Tier A of the measurement plan in [the video playback plan](video-playback.md): the two
measurements that touch neither app. **A1 is complete and answers decision 4 outright.**
**A2 cannot be answered from the available database** — see the last section.

The result is not the one the plan anticipated. Encoding *quality* is fine: every sampled asset
is H.264 High / yuv420p, at a sane resolution and bitrate. The problems are elsewhere — where
the files are hosted, how their `moov` atom is placed, their frame rate, and 210 published moves
whose pro-dancer video is a dead URL.

## Conditions and method

- Source of truth: the `dance_moves` rows in the Supabase project configured in
  `apps/server/.env`, read through PostgREST with the server's secret key. 1,086 rows, of which
  **808 are `published`**.
- Five video columns were collected per row: `main_video_url`, `pro_dancer_video_url`,
  `dancer_tip_video_url`, `presentation_video_url`, `film_yourself_video_url` →
  **5,127 distinct video URLs**.
- **Header pass (all 5,127 URLs):** one HTTP `HEAD` each for status, `content-length`,
  `content-type`, `cache-control`, `accept-ranges` and `server`.
- **`moov` placement pass (all 4,886 reachable URLs):** top-level MP4 boxes were walked with
  16-byte `Range` reads, so `moov` before `mdat` (`+faststart`) is decided without downloading
  the files.
- **Codec pass (200-URL stratified sample):** `ffprobe -show_format -show_streams` over HTTP,
  40 published URLs per role, evenly spaced over each role's sorted URL list (deterministic,
  re-runnable).
- **Keyframe pass (50-clip sub-sample):** keyframe positions taken from **packet flags**
  (`-show_entries packet=pts_time,flags`), not from `-skip_frame nokey`. On this corpus frames
  carry no `pts_time`, so the frame-based method reports one keyframe for every clip; the
  packet method was verified against three files downloaded locally.

## Results

### Hosting — not where the plan assumed

The plan records catalog media as "served from the public `dance-media` bucket". No catalog URL
is. All 5,127 are on two legacy Boogiz S3 buckets:

| Host | URLs |
| --- | ---: |
| `boogiz.s3.eu-central-1.amazonaws.com` | 4,583 |
| `boogiz-avatar.s3.eu-central-1.amazonaws.com` | 544 |

Every reachable response is served by `AmazonS3` directly, with **no `Via` header and no CDN in
front**, from eu-central-1. The corpus is 10.79 GiB across 4,886 reachable objects.

The headers are worse than the plan's "published asset cache-control is already correct" row —
that row describes *admin* uploads, which this corpus did not go through:

| Header | Result |
| --- | --- |
| `cache-control` | **absent on all 5,127** |
| `content-type` | `binary/octet-stream` 4,583 · `video/mp4` 299 · `video/quicktime` 4 · `application/xml` (error bodies) 241 |
| `accept-ranges` | `bytes` on all 4,886 reachable |

### 241 dead URLs, and 26 % of published moves are affected

| Role | Published moves whose URL returns 403 |
| --- | ---: |
| `pro_dancer_video_url` | **210 / 808 (26.0 %)** |
| `dancer_tip_video_url` | 1 / 808 |
| `main_video_url`, `presentation_video_url`, `film_yourself_video_url` | 0 |

240 of the 241 dead objects are on `boogiz-avatar`. No published move resolves to a dead URL
through `resolvePreviewMedia`, so **the Stepz feed and the mobile move cards are unaffected**.
The surface that breaks is `learn-dance-screen.tsx:173`, whose "Pro dancer" tab plays
`proDancerVideoUrl` directly: one in four published moves has a broken tab there today. This is
a content defect, independent of every playback option in the plan.

### `moov` is at the end of 95.6 % of the corpus

| Box order | URLs | Meaning |
| --- | ---: | --- |
| `ftyp > free > mdat` | 4,667 | `moov` at the end — **no faststart** |
| `ftyp > wide > mdat` | 4 | no faststart |
| `ftyp > moov` | **214** | faststart |

Per role, over reachable URLs (published subset in brackets):

| Role | URLs | faststart |
| --- | ---: | ---: |
| `main_video_url` | 1,083 | **0 (0 published)** |
| `dancer_tip_video_url` | 1,085 | **0 (0 published)** |
| `presentation_video_url` | 935 | **0 (0 published)** |
| `film_yourself_video_url` | 935 | 29 (8 published) |
| `pro_dancer_video_url` | 848 | 185 (58 published) |

`resolvePreviewMedia` prefers `mainVideoUrl`, which is **0 % faststart**. Every video the Stepz
feed plays therefore forces the player to fetch the end of the file before it can decode a single
frame — an extra round trip to eu-central-1, with no CDN, on every first play of every page.

### Codec and encoding — clean, except the frame rate

200-URL stratified sample, all 200 probed without error:

| Property | Distribution |
| --- | --- |
| Video codec | **h264 200/200** |
| Profile | High 198 · Main 2 |
| Pixel format | **yuv420p 200/200** |
| Level | 3.2 (141) · 3.1 (34) · 4.0 (19) · 4.2 (6) |
| Resolution | 720×1280 (153) · 720×1440 (19) · 720×1260 (19) · 1080×1920 (5) · 4 others (1 each) |
| **Frame rate** | **60 fps (166) · 30 fps (34)** |
| Rotation side-data | none |
| Audio | aac (160) · **no audio track (40)** |
| Encoder tag | `Lavf58.68.100` (194) · absent (6) |

| Measure | min | p25 | median | p75 | p90 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Duration (s) | 2.4 | 7.3 | **9.4** | 11.2 | 38.2 | 139.0 |
| Format bitrate (Mbps) | 0.36 | 0.86 | **1.18** | 1.52 | 2.08 | 17.65 |
| File size (MiB, all 4,886) | 0.00 | 0.89 | **1.54** | 2.55 | 4.63 | 190.24 |

**83 % of the corpus is 60 fps.** That doubles decode work per second against a 30 fps
assumption, on the one platform where concurrent-decoder count is the binding constraint, and it
is the single largest input to the Pixel adaptive-refresh question that no available hardware can
test.

### Keyframe interval — 4.17 s, not the 2 s the plan assumed

50-clip sub-sample, packet-flag method:

| Measure | Result |
| --- | --- |
| Median GOP, p50 | **4.167 s** |
| Median GOP, p90 | 8.333 s |
| Clips whose median GOP exceeds 2 s | **47 / 50** |
| Clips with exactly one keyframe (no seek point after t=0) | 3 / 50 (durations 2.4 s, 4.0 s, 7.7 s) |

4.167 s is 250 frames at 60 fps — FFmpeg's default `-g 250`, consistent with the `Lavf58.68.100`
encoder tag and no explicit GOP setting at ingest. The plan argued that a 2 s keyframe interval
(`-g 60`) is already too sparse for a surface that loops sections, changes rate and scrubs. The
real corpus is twice that again, and a 7.7 s clip with a single keyframe has no seek point at all.

> **Method correction.** An earlier run of this pass used
> `-skip_frame nokey -show_entries frame=pts_time` and reported *one keyframe per clip* across
> the whole sample. That is an artifact: frames in this corpus carry no `pts_time`, so every
> keyframe timestamp came back empty. Three files downloaded locally showed 12, 3 and 1 keyframe
> packets respectively, and the packet-flag method reproduces that over HTTP. Only the
> packet-flag numbers above are real.

## A2 — the `skippedMergeReason` rate is not answerable here

`skippedMergeReason` is still only logged (`media-worker.ts:161-165`), never persisted, but a
proxy exists without a new column: a `dance_media_jobs` row that is `completed` while its post's
`merged_video_path` is null is a skipped merge, and `music_id` separates "no music track" from
"unsupported video codec".

The proxy returns nothing usable, because the database has almost no user content:

| Measure | Count |
| --- | ---: |
| `dance_media_jobs` rows | **5** (all `completed`; 0 failed, pending or processing) |
| `dance_posts` rows | 12 |
| Posts with `merged_video_path` | 5 |
| Posts with `thumbnail_path` | 5 |
| Posts with a null `music_id` | 0 |

Five for five merged, zero skips — at n=5, that is not a rate. A2 needs either the production
database, if this is not it, or the additive `skipped_merge_reason` column so the question becomes
answerable once volume exists. **Do not record A2 as passed.**

## What this changes in the plan

1. **Decision 4 is answered.** Codec, profile and pixel format are uniform and universally
   decodable; resolution and bitrate are sane; durations are short (median 9.4 s). Phase 3's
   *transcode-for-compatibility* motivation is gone.
2. **But Phase 3 is not deletable — its content changes.** Three defects are ingest-side and
   fixable with `-c copy` remuxes or a re-encode, not with any client change:
   `+faststart` on 95.6 % of the corpus, a 1 s GOP for the practice surfaces, and the 60 fps
   question.
3. **`+faststart` is the cheapest large win available, and it is not in the ladder.** It is a
   remux (`ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`), it needs no app change, and
   it targets exactly the surface the pilot is measuring. Rung 0 hides the blank frame; this
   removes a cause of it. Sequence it *beside* rung 0, not after rung 3.
4. **Hosting is an open item the plan does not currently carry.** No CDN, no `cache-control`, and
   `binary/octet-stream` on 94 % of objects. `useCaching` (rung 2) and any CDN-hit-rate
   expectation in Phase 2 were both written against Supabase-hosted, immutable, correctly
   headered assets that this corpus is not.
5. **60 fps raises the decoder budget.** The ~4-decoder Android ceiling was reasoned about at an
   implied 30 fps. Three concurrent 60 fps 720p decoders is the real feed load.
6. **210 published moves have a broken "Pro dancer" tab.** Unrelated to playback performance, but
   found here and worth its own fix.
7. **Rung 0 is unblocked on the data side:** all 808 published moves have a poster image
   (`thumbnail_url` on 808/808), so the poster overlay always has something to show.

Still open in Phase 0: the physical iPhone baseline, throttled-network runs, the lesson/practice
surface, decoder counts, the `surfaceView`/`textureView` comparison, and the Pixel 9/10
refresh-rate check that no available hardware can run.
