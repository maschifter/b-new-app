# Stepz feed playback baseline — physical Android, 2026-09-24

This is one Phase 0 sample, before any feed playback changes. It is not the complete baseline
specified in [the video playback plan](video-playback.md).

## Conditions and method

- Physical Android `25078RA3EY`, API 36, 720 × 1600 display at 60 Hz (device supports
  60/90/120 Hz); Stepz staging development build connected to Metro.
- Unthrottled Wi-Fi. The local API was reached through `adb reverse tcp:3000 tcp:3000` and Metro
  through the existing `tcp:8081` reverse. No cellular, packet loss or bandwidth shaping.
- Feed open and playing. A user manually made 20 ordinary upward swipes followed by 10 quick
  swipes. OCR of the on-screen move title at 4 samples/s confirmed 30 forward page transitions,
  beginning on *Charlie* and ending on *Cash out*.
- Android `screenrecord` captured 72.06 s at 720 × 1600. The first page change occurred at
  about 10 s and the last at about 62.5 s. The [contact sheet](video-playback-android-baseline-contact.jpg)
  samples the recording every 2 s. The raw MP4 was deleted after analysis to save space.
- App UID `10465` received-byte counters came from `dumpsys netstats` immediately before the
  capture and after the user finished. To quantify visible empty media, frames were sampled at
  15 fps in a 300 × 600 central video crop (`x=210, y=250`), downscaled to 30 × 60 grayscale.
  A frame counted as blank when its mean luminance was below 25 and spatial standard deviation
  below 1; intervals required at least two consecutive sampled frames. This detects the uniform
  app background, rather than a merely dark video scene.

## Results

| Measure | Result |
| --- | ---: |
| Forward page transitions | 30 |
| Stepz received bytes during session | 189,465,054 B (180.7 MiB) |
| App-wide received bytes / transition | 6,315,502 B (6.02 MiB) |
| Stepz sent bytes during session | 3,946,465 B |
| Visible blank-video intervals | 24; 27.2 s total |
| Median / p95 / maximum blank interval | 0.83 s / 3.43 s / 3.93 s |
| Portion of the full recording with blank central video area | 37.7% |

During the ordinary-swipe portion, 21 blank intervals totalled 16.6 s (median 0.73 s, maximum
1.47 s). During the quick-swipe portion, three longer intervals totalled 10.6 s; each lasted
3.20–3.93 s and spanned more than one page. The first ten seconds, before swiping, showed
playing video. A later counter read added only 47,716 received bytes after the user stopped.

The received-byte delta covers **all Stepz UID traffic**, including catalog/API and development
traffic, so 6.02 MiB is a session average rather than an isolated MP4 cost. The phone denied
both remote input injection (`INJECT_EVENTS`) and enabling touch markers (`WRITE_SETTINGS`).
The recording therefore cannot timestamp finger release: blank-video duration is a useful
user-visible measure, but it is **not** swipe-to-first-video-frame latency. The development build
also prevents treating these figures as production performance. The 30 transitions crossed live
catalog order; stable move IDs were not frozen for a before/after comparison.

An attempted cold-start capture was discarded: restarting the development build opened the Expo
launcher, and the first bundle load could not reach the local API until port 3000 was reversed.
No cold-start playback number is reported from that attempt. This run also did not establish
concurrent decoder count: this device's `media.player` dump exposed codec capabilities but no
per-app active player count.

## What this changes in the pilot

The empty video area is directly visible on ordinary swipes and grows during quick swipes.
Rung 0's poster overlay has a concrete baseline to improve: reduce visible empty-media time.
Rung 1 should still be judged on received bytes **and** visible playback, since the current
session spent 180.7 MiB across 30 transitions. Before comparing a changed build, repeat on the
same device, network and fixed moves, and obtain a touch-release marker or instrument first-frame
events if the exact latency target is required.

Remaining Phase 0 work: a physical iPhone pass; throttled-network runs; the practice/lesson
surface; catalog `ffprobe` statistics; the non-H.264 merge rate; decoder-count and surface-type
comparison. The Pixel 9/10 refresh-rate check remains unavailable on this hardware. The contact
sheet and aggregate numbers remain, but the deleted raw recording cannot be re-analysed frame
by frame.
