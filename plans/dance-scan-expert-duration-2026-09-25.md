# Scan server fails on expert videos ≥ 9s — 2026-09-25

**Verdict: an upstream regression in the two `pose-compare` scan servers, not a defect in
this repo and not a property of our migrated media.** Both servers return HTTP 500 whenever
the `expert_url` video is about 9 seconds or longer. Shorter expert videos score normally on
the same servers, in the same minutes. Roughly **half the move catalog** is long enough to
trip it, and every affected scan burns three attempts and ~74 s before handing the user a
`generateFallbackScore()` number.

Written after the 07:57–07:59 UTC outage recorded in `dance_scan_events` for
`post_id = 230956ea-58c6-469f-b414-b09654c20672`.

## Conditions and method

- Scan servers, as configured in `apps/server/src/modules/dance/config.ts`:
  `https://pose-compare-cem.replit.app` and `https://pose-compare-2.replit.app`.
- Every call below is a bare `POST` with `expert_url`, `amateur_url` and `jobid`,
  form-urlencoded — the same body `scanning-client.ts` sends. No app, worker or database
  involved, so nothing here depends on our code being correct.
- Known-good inputs were recovered from the Boogiz mongodump at
  `boogiz-resource/backup/2026-06-17/boogiz-backup/boogiz` by joining
  `scannings.bson` (`status: completed`, `isExternalScore: true`) → `posts.bson` →
  `dancemoves.bson`. Boogiz sends `post.videoLink` as `amateur_url` and
  `danceMove.filmYourSelfLink` as `expert_url` (`app/utils/post.util.js:291`).
- All source URLs were confirmed live (HTTP 200, `video/mp4`) before use.

## 1. The scan servers are healthy

Replaying two scans that succeeded in Boogiz production on 2026-06-17 reproduces their
scores almost exactly:

| Pair | Server | Score then | Score now | Time |
| --- | --- | --- | --- | --- |
| Suii Jump | pose-compare-cem | 54 | **55** | 15.6 s |
| Rolls | pose-compare-2 | 50 | **51** | 14.5 s |

So the outage was never "the servers are down".

## 2. The failure tracks expert duration

One fixed, known-good amateur video; only `expert_url` varies. Deterministic across
repeats and across both servers:

| Expert video | Duration | Result |
| --- | --- | --- |
| Come'ON (Boogiz S3) | 5.50 s | 200 `{"score": 33}` |
| Brush off (Boogiz S3) | 8.00 s | 200 `{"score": 46}` |
| Biking | 8.15 s | 200 `{"score": 30}` |
| Camel walk | 8.32 s | 200 `{"score": 63}` |
| 2-step shuffle | 8.48 s | 200 `{"score": 30}` |
| Attitude | 8.50 s | 200 `{"score": 44}` |
| ✔️ Bling | 8.63 s | 200 `{"score": 42}` |
| Cash out | 8.72 s | 200 `{"score": 43}` |
| Échappé | 9.00 s | **500** |
| Dj | 9.15 s | **500** |
| Boogalooz | 9.27 s | **500** |
| Afro step | 9.35 s | **500** |
| Bela#1 | 9.50 s | **500** |
| Charlie (the move that failed in production) | 9.53 s | **500** |
| Bang bang | 9.63 s | **500** |
| Chef | 9.77 s | **500** |
| Cha cha chace | 9.82 s | **500** |
| Kick cross (Boogiz S3) | 10.33 s | **500** |
| Blablabla (Boogiz S3) | 10.77 s | **500** |
| Dripping funk (Boogiz S3) | 11.17 s | **500** |

The boundary sits between **8.72 s (passes) and 9.00 s (fails)**. Failures return in
6–17 s — the server answers, it does not time out, which is why the production rows show
`HTTP 500` rather than a timeout.

## 3. It is not ours

Three independent checks, each of which alone rules out a local cause:

- **Boogiz's own assets fail identically.** `Dripping funk`, `Blablabla` and `Kick cross`
  are still served from `boogiz.s3.eu-central-1.amazonaws.com` — untouched by our
  migration, our repoint and our remux — and all three return 500.
- **The same file is fine in the amateur slot.** Charlie's 9.53 s `film-yourself.mp4`
  returns 500 as `expert_url`, but scores **58** and **64** when passed as `amateur_url`.
  The server therefore downloads it, decodes it and detects poses in it without trouble.
  The defect is on the expert code path only.
- **Same host, same folder, opposite outcomes.** `main.mp4` (9.53 s) and
  `presentation.mp4` (9.00 s) sit in the same Supabase bucket folder and differ only in
  filename; one fails and one passes. Hosting, CDN, signed URLs and URL shape are all
  excluded.

### Hypotheses tested and rejected

- **`moov` placement / faststart.** Rejected. A tail-moov 9.00 s clip passes, while two
  faststart clips (`main.mp4`, `pro-dancer.mp4`) fail. This was the first theory and it was
  wrong; recorded here so it is not re-tried.
- **Codec, profile, resolution, frame rate.** Rejected. Passing and failing files are both
  H.264 High / yuv420p / progressive / 60 fps, and failures span 720×1260, 720×1280 and
  1080×1920.
- **Frame count.** Rejected. 30 fps failures (Ambassador#1, 303 frames; Clara Christmas
  Funk, 336 frames) have *fewer* frames than 60 fps passes (Crooked, 487 frames). The
  quantity that separates the two groups is wall-clock seconds.
- **CDN serving stale bytes.** Rejected. The public CDN URL and the authenticated storage
  origin return byte-identical files (`sha256` match, 1 399 887 bytes,
  `last-modified: Wed, 26 Aug 2026`).
- **Server load or drift during testing.** Rejected. Passing and failing videos were
  re-run interleaved and back to back; every result reproduced.

### One unexplained outlier

`presentation.mp4` is 9.000 s — identical duration, frame count and audio duration to
Échappé's expert video — yet it scores 27 on every attempt while Échappé returns 500. It is
720×1440 animated-avatar footage rather than 720×1280 live footage, and it is not a
`film_yourself_video_url`, so it is not part of the production corpus. The threshold is
therefore *not* a pure wall-clock cut-off; duration is the variable that separates the real
expert corpus cleanly, but something else also matters. Left open.

## 4. Blast radius

Durations of `film_yourself_video_url`, measured over a 300-move sample of the catalog
(all readable, no errors):

| Bucket | Moves |
| --- | --- |
| < 9 s — scorable | 155 (51.7 %) |
| ≥ 9 s — HTTP 500 | **145 (48.3 %)** |

min 2.08 s · mean 8.67 s · max 41.67 s

```
 4- 5s  28     9-10s  62
 5- 6s  24    10-11s  39
 6- 7s  15    11-12s  31
 7- 8s  31    12-13s   3
 8- 9s  52    13-14s  10
```

The distribution peaks either side of the threshold, so the cut-off lands near the middle
of the catalog and small changes in it move a lot of moves.

**Note on scope:** this is a 300-row sample, not the whole catalog — there are 1 086
`dance_moves` rows, 808 of them `published`, and all 808 published rows do have a
`film_yourself_video_url`. The full catalog was deliberately not probed. Treat 48 % as a
sample estimate.

Per affected scan the user waits through 3 attempts with 3 s and 6 s backoff — about
**74 s** in the production rows — and is then shown a random 50–70 fallback with
`is_external_score = false`.

## 5. Timeline

The same move behaved differently within twelve minutes on 2026-09-25:

| Time (UTC) | Move | Result |
| --- | --- | --- |
| 07:45:18 | Charlie (9.53 s) | `scored`, **100**, `is_external_score: true`, 13 725 ms |
| 07:57:59 → 07:59:13 | Charlie (9.53 s) | 6 × HTTP 500 across both servers → `fallback` 69 |

Charlie's `film_yourself_video_url` has not changed since 2026-08-26 (storage
`last-modified`), and the row was last touched 2026-09-24 09:07 UTC — before both events.
Today the same move fails deterministically. **Inference, not proof:** the scan servers
changed some time between 07:45 and 07:57 that morning. Nothing on our side moved in that
window, and the regression reaches Boogiz's own assets too.

## 6. Reproducing it

No app, database or credentials needed:

```sh
curl -X POST https://pose-compare-cem.replit.app \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "expert_url=https://boogiz.s3.eu-central-1.amazonaws.com/avatar/server/1757933009534_608b799e377b3b0946236e40_filmYourSelfLink.mp4" \
  --data-urlencode "amateur_url=https://boogiz.s3.eu-central-1.amazonaws.com/videos/1781674168334_6a32309df71e438e30b18a27.mp4" \
  --data-urlencode "jobid=repro_short"    # 7.57 s expert -> 200 {"score": 55}
```

Swap `expert_url` for any clip of 9 s or more and the same call returns
`Internal Server Error`.

## 7. What this does and does not license

- The fix belongs to whoever owns the `pose-compare` replit deployments. Re-encoding or
  trimming our catalog would work around it, but that changes product content and would not
  help Boogiz, which is equally affected.
- Nothing in this repo was changed for this investigation.
- Worth considering while it is unfixed: the server already knows the expert duration is a
  risk factor, so a warning when `film_yourself_video_url` exceeds the threshold would tell
  us which moves will silently produce fake scores, instead of finding out one user
  recording at a time. Not implemented — it presumes the threshold holds, and the
  `presentation.mp4` outlier says it is not fully characterised.
