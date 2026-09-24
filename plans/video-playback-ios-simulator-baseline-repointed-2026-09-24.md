# Stepz feed playback baseline — iOS Simulator, repointed corpus, 2026-09-24

This repeats [the earlier simulator diagnostic](video-playback-ios-simulator-baseline-2026-09-24.md)
after the catalog rows were repointed at the migrated `dance-media` objects and all 808 published
`main` objects were remuxed with `moov` ahead of `mdat`. It is still a **diagnostic on a
simulator**, not the physical-iPhone tier B baseline [the plan](video-playback.md) requires, and
its numbers must not be compared head-to-head with the
[Android device run](video-playback-android-baseline-repointed-2026-09-24.md). No app code changed.

## Conditions and method

- iPhone 17 Pro Simulator, iOS 26.4, 1206 × 2622 capture at 30 fps; Stepz Staging development
  build against the same Metro (8081) and local API (3000) as before. Unthrottled network. The
  simulator uses the Mac's CPU, GPU and network path, so these timings do not estimate a phone.
- The **same saved flow** drove the session
  ([`stepz-ios-feed-paced-baseline-2026-09-24.yaml`](../.argent/flows/stepz-ios-feed-paced-baseline-2026-09-24.yaml)):
  restart, wait for the feed, 20 ordinary upward swipes (450 ms gesture, ~2.0–2.2 s apart), then
  10 faster flings (100 ms gesture, ~1.8 s apart). It replayed **PASS — 7 scored steps, 0 failures**.
  Because the gestures are injected, the cadence is identical to the earlier run rather than merely
  similar.
- Argent recorded 92.03 s with touch visualisation and static trimming disabled.
- Blank detection repeats the earlier run's rule exactly: central crop `x=378, y=800, 450 × 800`,
  downscaled to 30 × 60, a frame counted blank when FFmpeg `signalstats` reports `YAVG < 25` **and**
  `YHIGH < 35`, an interval requiring two consecutive frames.
- Title OCR at 2 samples/s resolved the page sequence. The
  [contact sheet](video-playback-ios-simulator-baseline-repointed-contact.jpg) samples every 2 s.

## Results

| Measure | Legacy S3, tail-`moov` | Repointed + faststart |
| --- | ---: | ---: |
| Swipes sent | 30 | 30 |
| Forward page transitions | 30 | 28 |
| Uniform blank-video intervals | 16 | **3** |
| Total blank-video time | 23.1 s | **6.03 s** |
| Median / p95 / maximum blank interval | 0.82 / 8.17 / 8.17 s | 0.90 / 5.03 / 5.03 s |
| Blank-video fraction of the recording | 19.7 % | 6.6 % |
| Blank video **during the swipe sequence** | present, including the 8.17 s *Chikala* gap | **none** |

All three remaining blank intervals sit before the first swipe, which the flow sent at 13.87 s:
5.03 s from 5.63–10.67 s is the app relaunch before the feed's first frame, and 0.90 s and 0.10 s
at 12.20 s and 13.13 s are on the first page while it settles. **From the first swipe to the end of
the recording the central video area was never uniform background.** The earlier run's worst
interval, 8.17 s on *Chikala*, is gone: that page now plays through its 2.5 s on screen.

Playback was verified live rather than assumed: over a settled five-second stretch the central crop
changed by a mean of 14.2 grey levels per frame with only 21 of 149 frames near-static, so the page
was showing moving video, not a poster.

Two of the ten fast flings did not advance a page — *Bloob Swipe* and *Turning travel* each held
for 3.5 s across two gestures — so the session covered 29 moves (*Charlie* → *snakies*) and 28
transitions instead of 30. The earlier run reached *Cash out*. That difference reduces the work
done by two pages; it does not explain a fall from 23.1 s of blank video to none during swiping.

## Limits of this sample

A simulator has no hardware decoder limit, no radio, and the Mac's network path, so it cannot
speak to the decoder accumulation and the byte cost that the Android run measured — the two
findings that most affect the pilot. Transferred bytes were again not measured: the React Native
network interceptor sees only `fetch()`, not native `expo-video` traffic, and a simulator has no
per-app byte counter equivalent to `dumpsys netstats`. There is still no first-frame event in the
recording, so blank-interval duration remains a proxy rather than swipe-to-first-frame latency,
even though the injected gestures now carry exact timestamps. The build is a development build.
The raw 62 MB recording was not committed; the contact sheet and these aggregates are what remain.

## What this changes in the pilot

1. **On a machine with no decoder ceiling and a fast link, the repointed corpus alone removes the
   symptom rung 0 was meant to hide.** A poster overlay would have nothing to cover here. That
   makes the simulator useless as a rung-0 acceptance surface and confirms the pilot must be judged
   on the physical device.
2. **It isolates where the remaining Android cost comes from.** Same media, same cadence, same
   code: iOS Simulator shows no empty media, the phone still shows 0.57 s per transition. What
   differs is decode capacity and link speed, which points at the decoder pool (rung 3) and the
   unbounded buffers (rung 1) rather than at the media.
3. **Cold start is now the only blank the simulator shows** — 5.03 s from relaunch to the feed's
   first frame. That is a development-build launch and is not a pilot target, but it is the one
   number here worth re-measuring on a release build.

The physical-iPhone pass is still owed; nothing in this run substitutes for it.
