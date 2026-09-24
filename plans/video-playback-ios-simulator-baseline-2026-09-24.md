# Stepz feed playback baseline — iOS Simulator, 2026-09-24

This is a diagnostic Phase 0 sample on a simulator, not the physical-iPhone Tier B baseline
required by [the video playback plan](video-playback.md). No app code changed for this run.

## Conditions and method

- iPhone 17 Pro Simulator, iOS 26.4, 1206 × 2622 capture; Stepz Staging development build
  (`com.bnewapp.stepz.staging`) connected to the existing Metro server on port 8081 and the
  local API on port 3000. Network was unthrottled. The simulator uses the Mac's hardware and
  network path, so these timings are not estimates of a physical iPhone.
- Restarted the app and entered the Stepz feed at *Charlie*. A paced Argent flow performed
  20 ordinary upward swipes (450 ms gesture, approximately 2.0–2.2 s between gestures), then
  10 quicker swipes (100 ms gesture, approximately 1.8 s between gestures). The final page was
  *Cash out*. Title OCR at 2 samples/s and the [contact sheet](video-playback-ios-simulator-baseline-contact.jpg)
  corroborated 31 sequential pages, hence 30 forward transitions. The [recorded flow](../.argent/flows/stepz-ios-feed-paced-baseline-2026-09-24.yaml)
  also passed one uninterrupted full replay (7 scored steps, 0 failures).
- Argent captured 117.7 s of screen video at 30 fps with touch visualisation and static
  trimming disabled. The raw MP4 was deleted after analysis to save space. A central video
  crop (`x=378, y=800, width=450, height=800`) was downscaled to 30 × 60.
  A frame counted as a uniform blank background when FFmpeg `signalstats` reported
  `YAVG < 25` and `YHIGH < 35`; an interval needed at least two consecutive frames. The
  initial 0.1 s before interaction was excluded. This detects the app background in the video
  region, not all buffering or a deliberately dark video frame.

## Results

| Measure | Result |
| --- | ---: |
| Forward page transitions | 30 |
| Uniform blank-video intervals | 16 |
| Total blank-video time | 23.1 s |
| Median / p95 / maximum blank interval | 0.82 s / 8.17 s / 8.17 s |
| Blank-video fraction of full recording | 19.7% |
| Native UI hangs during a separate flow replay | One 264 ms microhang, at trace +5.7 s |

The 8.17 s interval ran from recording time 20.27–28.43 s on the *Chikala* page. Three other
intervals lasted 2.23–2.27 s. The 264 ms native microhang was detected by Instruments during
the replay, but its stack was unavailable, and its early timestamp is near app restart; it
cannot be attributed to video swiping from this trace alone. No actionable CPU hotspot was
reported.

This is **not** swipe-to-first-video-frame latency. The screen recording showed touches, but
this analysis did not establish a per-gesture finger-release timestamp matched to each page's
first decoded frame. The blank intervals are a visible symptom and can span loading or missing
media. App-wide transferred bytes per swipe were not measured: the React Native network
interceptor only captured `fetch()` and did not capture native `expo-video` traffic. React commit
profiling did not survive the flow's app restart, so JS render/jank numbers are unverified.
The staging development build and profiling overhead also preclude production conclusions.

The earlier unpaced 30-gesture recording is discarded as a measurement: many gestures were
sent while the feed was still transitioning, so they did not produce 30 distinct page changes.
Its MP4 was also deleted; the discarded flow remains in `/private/tmp/` and was not committed.

## Interpretation and next measurement

The simulator confirms that the current feed can show a uniform background during forward
navigation, including multi-second gaps. Its 23.1 s total must **not** be compared directly
with the [Android physical-device sample](video-playback-android-baseline-2026-09-24.md)
(27.2 s): the platforms, hardware, swipe cadence, recording lengths and network paths differ.
Before setting an iOS target or judging a playback change, repeat the same 30-transition
scenario on the physical iPhone, then add a reliable finger-release/first-frame marker and an
isolated transfer-byte measurement. The lesson/replay surface and throttled-network passes
remain open. The contact sheet and aggregate numbers remain, but the deleted raw recording
cannot be re-analysed frame by frame.
