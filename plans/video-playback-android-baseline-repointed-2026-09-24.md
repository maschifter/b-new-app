# Stepz feed playback baseline — physical Android, repointed corpus, 2026-09-24

This repeats [the earlier Android baseline](video-playback-android-baseline-2026-09-24.md) on the
same device and network, after two changes to the media the app fetches: the catalog URL columns
were repointed at the migrated `dance-media` objects (`scripts/repoint-dance-media.mjs`), and all
808 published `main` objects were remuxed so `moov` precedes `mdat`
(`scripts/remux-faststart.mjs`). The earlier run measured the legacy Boogiz S3 copies with `moov`
at the end of the file; this one measures what the apps fetch today. It is still one Phase 0
sample, not the complete baseline specified in [the video playback plan](video-playback.md).

## Conditions and method

- Physical Android `25078RA3EY`, API 36, 720 × 1600 at 60 Hz. Stepz staging development build,
  force-stopped and relaunched through the dev-client deep link so the feed loaded cold. Metro and
  the local API were reached over `adb reverse` (`tcp:8081`, `tcp:3000`); that traffic is loopback
  and does not appear in the byte counters below, which carry only Wi-Fi idents.
- Unthrottled Wi-Fi, no shaping. The feed opened on **Charlie** — the same first move as the
  earlier run — and the session ended on **Cash out**, again the same.
- A user made 20 ordinary upward swipes followed by 12 quick ones. Raw touch events were captured
  from `/dev/input/event3` with `getevent -lt`, which timestamps every finger-down and finger-up;
  32 upward gestures were recorded. OCR of the on-screen move title at 4 samples/s resolved
  **30 forward page transitions**, so two swipes did not advance a page (or two pages were shown
  too briefly for a 4 Hz sampler to see).
- `screenrecord --bugreport` captured 113.76 s at 720 × 1600. Swiping began at 49.20 s of the
  recording and the last title change landed at 106.50 s, so the **swipe window is 58.80 s**; the
  first 49 s are one untouched, looping page. The
  [contact sheet](video-playback-android-baseline-repointed-contact.jpg) samples every 2 s.
- Blank-media detection repeats the earlier run's rule exactly: frames sampled at 15 fps, a
  300 × 600 central crop at `x=210, y=250`, downscaled to 30 × 60 grayscale, a frame counted blank
  when mean luminance is below 25 and spatial standard deviation below 1, intervals requiring two
  consecutive samples. This finds the uniform app background rather than a dark video scene.
- App UID `10465` byte counters came from `dumpsys netstats detail` immediately before and after.
  Decoder state came from `dumpsys media.resource_manager` and `dumpsys media.metrics`.

## Results

| Measure | Legacy S3, tail-`moov` | Repointed + faststart |
| --- | ---: | ---: |
| Forward page transitions | 30 | 30 |
| Swipe window | ~52.5 s | 58.80 s |
| Visible blank-video intervals | 24 | 17 |
| Total blank-video time | 27.2 s | **17.20 s** |
| Blank video per transition | 0.91 s | **0.57 s** |
| Median / p95 / maximum blank interval | 0.83 / 3.43 / 3.93 s | 0.67 / 2.40 / 3.73 s |
| Received bytes, whole session | 189,465,054 B | 293,622,623 B |
| Received bytes per transition | 6,315,502 B | **9,787,421 B** |

Split by swipe speed, the picture the user sees is still much worse when paging quickly:

| Portion | Intervals | Blank total | Share of the portion | Median / max |
| --- | ---: | ---: | ---: | ---: |
| 20 ordinary swipes (39.71 s) | 9 | 7.13 s | 18.0 % | 0.47 / 3.73 s |
| 12 quick swipes (19.09 s) | 8 | 10.07 s | 52.7 % | 1.40 / 2.40 s |

Blank time fell by 37 % for the same 30 transitions between the same two moves. Every blank
interval fell inside the swipe window; the 49 s of untouched playback before the first swipe
contained none.

The byte figure moved the other way, and the session's shape explains only part of it. A separate
measurement on a freshly opened, untouched feed recorded **8,736,020 B in 60 s** — 145.6 KB/s, or
about 1.16 Mbps, which is the corpus's median bitrate. **A looping clip is re-downloaded on every
loop**; nothing is cached, exactly as the plan's `useCaching` row predicts. Subtracting that rate
across the 56.3 s of untouched time inside the counter window leaves ~285.4 MB of swipe-driven
traffic, **9.51 MB per transition** against ~6.2 MB for the legacy run — still roughly 50 % more.

## Decoder state, measured for the first time

The earlier run could not establish concurrent decoder count. `dumpsys media.resource_manager`
does report it per pid:

- A **freshly opened feed** holds **2 `c2.mtk.avc.decoder` + 2 `c2.android.aac.decoder`**, stable
  over a minute of untouched playback.
- **After the 32-swipe session** the same process held **6 AVC + 5 AAC decoders**, and still held
  them minutes later while sitting paused on one page. Decoder clients accumulate as pages are
  mounted and are not released when the pages go away.
- `dumpsys media.metrics` recorded at least **25 video-decoder destructions inside the 49 s swipe
  window**, median lifetime 7.2 s (min 3.9 s, max 10.4 s), with 8,744,356 B of compressed video
  and 3,276 frames fed to them — about 350 KB and 131 frames, roughly 2.2 s of 60 fps content, per
  decoder.
- Every decoder was configured at `frame-rate=60`, `operating-rate=60`, 720 × 1280, which confirms
  the tier A finding that 87 % of the corpus is 60 fps on the decode side as well.
- `renderFrameCount` and `playbackMs` are reported as 0 for every record by this MediaTek stack,
  so rendered-frame counts cannot be derived from that dump.

## Limits of this sample

The build is a development build, so these are not production figures. The device denies
`INJECT_EVENTS` at the OS level, so swipes remain manual and their cadence differs run to run —
what matches between the two runs is the device, the network, the start and end move and the
transition count, not the timing of individual swipes. The raw touch log now gives finger-down and
finger-up times (median contact 133 ms ordinary, 124 ms quick; median gap 2.00 s and 1.40 s), but
the recording still carries no first-frame event, so **swipe-to-first-frame latency is still not
directly measured** — blank-interval duration remains the proxy. Received bytes still cover all
Stepz Wi-Fi traffic rather than an isolated MP4 cost. The raw 99 MB recording was kept only in the
session scratchpad; the contact sheet and these aggregates are what remain.

## What this changes in the pilot

1. **Rung 0's target moves.** Visible empty media is 0.57 s per transition, not 0.91 s. The
   poster overlay has less to win than the earlier baseline implied, and it must be judged against
   this number.
2. **Rung 1 got more important, not less.** Per-transition bytes rose about 50 % once the corpus
   moved behind the CDN. Nothing bounds the neighbour buffers, so faster delivery simply fills
   them faster: the pilot bought a better picture and a worse bill in the same change. Bounding
   the buffer is now the item with the clearest measured cost behind it.
3. **The looping re-download is a second, separate byte leak.** 1.16 Mbps continuously while the
   user reads a single page is the same order as the paging cost on a slow scroll, and it is what
   `useCaching` (rung 2) addresses directly.
4. **The decoder assumption in the plan understates the steady state.** The plan reasons about
   ~3 live decoders from `windowSize={3}`. A fresh feed holds 2, but after ordinary use the
   process holds 6 and does not give them back — evidence for rung 3's pooled player, and a
   reason to re-check decoder count after any rung lands.

Remaining Phase 0 work is unchanged except for the decoder item, which this run closes: a physical
iPhone pass; throttled-network runs; the practice/lesson surface; the non-H.264 merge rate; the
`surfaceView` vs `textureView` comparison. The Pixel 9/10 refresh-rate check remains unavailable
on this hardware.
