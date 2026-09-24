# Video Playback — Research & Implementation Plan

Status: **research complete; Phase 0b shipped; tier A catalog statistics complete; Android physical-device baseline and iOS Simulator diagnostic recorded; the pilot not started.** Written 2026-09-23,
revised through 2026-09-24.
Every code, package and line reference below was verified against the working tree and against
`node_modules/expo-video@55.0.21` — including the native iOS and Android sources, not only the
changelog. Three questions are closed: the `expo-video` version (**stay on SDK 55**, see
option 0), the shape of the first slice of work (**the Stepz feed, one rung at a time**, see
Phase 1), and **decision 1** — answered 2026-09-24: the promise is **both, split by surface**.
The feed is won on *first* play, the practice surfaces on *repeat* play, so the two tracks run
alongside each other rather than one behind the other. Nothing in this document is blocked. Two
items stay open and gate only themselves: **decision 7** (may practice clips be downloaded to the
device — deferred by the product owner) and the Pixel 9/10 refresh-rate measurement, which **no
available hardware can run**. One physical-Android, unthrottled-Wi-Fi feed session is recorded in
[the Android baseline](video-playback-android-baseline-2026-09-24.md), re-measured against the
repointed and remuxed corpus in
[the second Android baseline](video-playback-android-baseline-repointed-2026-09-24.md), and an
iOS Simulator [diagnostic](video-playback-ios-simulator-baseline-2026-09-24.md) covers the same 30
forward transitions, likewise
[re-measured](video-playback-ios-simulator-baseline-repointed-2026-09-24.md). The simulator
diagnostic does not replace the required physical-iPhone baseline; the rest of Phase 0 remains
open. [Tier A](video-playback-catalog-assets-2026-09-24.md) closes
**decision 4** and changes three things below: **98.3 % of the catalog has `moov` at the end of
the file**, and 87 % of it is 60 fps. It also found that the `dance_moves` URL columns were
never repointed at the migrated objects; **that was fixed on 2026-09-24**
(`scripts/repoint-dance-media.mjs`, 6,926 fields), so the two baselines recorded before it were
measured against the pre-migration copies and no longer describe what the apps fetch; the Android
one was re-run the same day and the iPhone pass is still owed.
Every number in *Targets* is a proposal, not a product contract.
## Goal

Make video playback feel immediate and reliable for dance lessons, reference clips, the
Stepz feed, and recorded-dance replays, particularly on weak or variable mobile networks.
This document is a working record for the next research and implementation session.

## Current architecture

- Both Expo apps use Expo SDK 55's `expo-video` (`expo-video@55.0.21`) for playback.
- Lesson, reference, feed and catalog videos are remote MP4 URLs supplied in dance-move
  records. The media lives in the public `dance-media` bucket, keyed by `legacy_id`
  (`moves/<legacy_id>/main.mp4`, …), and all 808 published moves have a complete copy there.
  The URL columns were **repointed at those objects on 2026-09-24** by
  `scripts/repoint-dance-media.mjs` (6,926 fields across `dance_moves` and `music_tracks`); every
  published move's preview and thumbnail URL is now a `dance-media` URL, and
  `service.ts:toDanceMove` passes it through unrewritten, which is now correct. What remains on
  legacy S3 is 241 fields whose object was never migrated because the source 403s — 210 of them
  `pro_dancer_video_url` on published moves. Measured 2026-09-24 —
  [tier A](video-playback-catalog-assets-2026-09-24.md).
- User recordings are uploaded to the private `dance-videos` bucket. The API generates
  short-lived signed read URLs for those videos, merged outputs, and posters.
- The media worker adds music to a recorded video, creates a JPEG poster/blurhash, and
  writes `+faststart` on the merged MP4. It preserves the original video stream with
  `-c:v copy`, and **skips the merge entirely when the capture is not H.264**
  (`skippedMergeReason` in `media-processor.ts`) rather than remuxing something unplayable.
  Nothing in the pipeline transcodes, resizes, or creates adaptive renditions.
- Catalog media uploaded through admin accepts MP4 and is returned as a public URL. There
  is no encoding or rendition-generation pipeline.
- Captures are bounded: `maxDuration` seconds at ~1.5 Mbps (60 s ≈ 11 MB). **Every asset in
  this product is short-form.** That single fact drives most of the recommendations below.

## Confirmed findings

| Area | Evidence in the codebase | User impact |
| --- | --- | --- |
| Native video cache | Remote players receive a string URL; no source passes `useCaching: true`. `expo-video` defaults this option to `false`. | Repeat viewing redownloads/rebuffers instead of using device storage. |
| No *deliberate* preload anywhere | No code creates a detached `VideoPlayer` or calls `replaceAsync` to warm a source. Every player is created by `useVideoPlayer` at mount, attached to a view immediately. | There is no policy, no budget and no back-pressure. But a mounted player is not a cold one — see the row below. |
| Stepz feed pager | `FlatList` with `windowSize={3}`, `initialNumToRender={2}`, `pagingEnabled`; each `FeedMovePage` mounts its own `useVideoPlayer` regardless of `active`. **A player prepares its source at construction**, so both neighbours are already buffering — up to `preferredForwardBufferDuration` (Android 20 s, iOS auto), with no byte cap. | ~3 decoders alive *and* ~3 unbounded buffers. The feed already has lookahead; what it lacks is a bound on it, a priority between active page and neighbour, and any back-pressure. |
| Catalog cards | Every `DanceMoveCard` mounts a `useVideoPlayer(url)`, while only the selected card calls `play()`. | A list can prepare/download more video than the user will watch. |
| Recorded-dance grid | A history cell without a worker-created poster mounts and displays a `VideoView` (`DanceVideoCell`). | Multiple grid cells can allocate player/decoder/network work during scroll. |
| Signed UGC URLs | `service.ts` signs profile videos for 1 h; the media and scan workers sign for 5 min. Each list/detail response mints new URLs. | The full signed URL changes; both CDN and the device cache miss even for the same object. |
| No cache key escape hatch | `VideoSourceObject` has `uri`, `headers`, `useCaching`, `contentType`, `drm`, `metadata` — **no `cacheKey`**, unlike `expo-image`, which `dance-post-grid.tsx` already uses with `cacheKey: post.thumbnailPath`. | Video cache identity *is* the URL. Rotating signed URLs makes `useCaching` useless for UGC. |
| Published asset cache-control | Correct on every path. Admin uploads set `cacheControl: "31536000, immutable"` (`media-upload-input.tsx:150`, `dance-media-service.ts:147`), and `migrate-dance-media.mjs:263` uploaded the legacy corpus with `max-age=31536000`. Verified 2026-09-24 on a migrated object: a ranged `GET` returns `cache-control: max-age=31536000` and `cf-cache-status: HIT`. | Nothing to fix. A `HEAD` to the same object answers `no-cache` / `REVALIDATED`, which is a property of Supabase's public `HEAD` handler, not of the stored metadata — do not measure cache behaviour with `HEAD`. |
| Catalog `moov` placement | Was **98.3 % `moov` at the end** (`ftyp > free > mdat`), including **0 % faststart on `main`**. **Fixed 2026-09-24 for the feed:** `scripts/remux-faststart.mjs` remuxed all 808 published `main` objects, verified 808/808 at the edge. The other roles (`dancer-tip`, `presentation`, `pro-dancer`, `film-yourself`) are untouched and still tail-`moov`. | The feed no longer pays a range-fetch to the end of the file before its first frame. The practice surfaces still do — run the script with `--field all` when Phase 1b starts. |
| Catalog frame rate | **87 % of the sampled corpus is 60 fps** (174/200), the rest 30 fps; all H.264 High / yuv420p, mostly 720×1280, median bitrate 1.20 Mbps, median duration 9.6 s. | Decode cost per second is double the implied 30 fps assumption, on the platform where decoder count binds. |
| Catalog keyframe interval | Median GOP **4.167 s** (= `-g 250` at 60 fps, FFmpeg's default), p90 8.333 s; 48/50 sampled clips exceed 2 s. | Seek, section-loop and scrub accuracy on the practice surfaces is bounded at ~4 s, twice as coarse as the `-g 60` case this plan already called wrong. |
| Catalog URLs the apps actually request | Repointed 2026-09-24: all 808 published moves now serve `main_video_url` and `thumbnail_url` from `dance-media`; 12/12 sampled preview URLs answered `206` with `cache-control: max-age=31536000` and `cf-cache-status: HIT`. **241 fields stay on Boogiz S3 and return HTTP 403**, 210 of them `pro_dancer_video_url` on published moves, which `learn-dance-screen.tsx:173` plays. | The feed and every thumbnail are now on the migrated corpus behind a CDN. The 210 need their pro-dancer video re-uploaded; no published move's *preview* URL is dead. |
| Upload path | Recording upload calls `File.bytes()` and makes one `PUT`, capped at 64 MB. | Larger future captures can cause memory pressure and transfers cannot resume. |

### Verified against the installed package (source-level)

Read out of `node_modules/expo-video@55.0.21/build`, not out of the docs, because two
recommendations below depend on exactly how the hook behaves.

- **`useVideoPlayer` re-creates the native player whenever the source changes.** It is
  `useReleasingSharedObject(…, [JSON.stringify(parsedSource), JSON.stringify(playerBuilderOptions)])`
  (`build/VideoPlayer.js`); it never calls `replace`/`replaceAsync` on your behalf. Two
  consequences:
  - A rotating signed URL does not merely miss the cache — it **tears down and rebuilds the
    player** on every refetch that mints a new token. `dance-post-detail-screen.tsx` passes
    `post.mergedVideoUrl ?? post.videoUrl` straight into the hook. This is a second,
    independent reason to memoize signed URLs server-side.
  - Mux's "pass `null` as the source outside the preload window" trick, implemented with
    `useVideoPlayer`, allocates and releases a native player on every window transition.
    Real player *reuse* requires `createVideoPlayer` + `replaceAsync` + a manual `release()`,
    owned above the list item.
- **A player prepares its source the moment it is constructed, on both platforms.** Android:
  `VideoModule.kt:74-79` — the `VideoPlayer` `Constructor` runs
  `appContext.mainQueue.launch { player.prepare() }`. iOS: `VideoPlayer.swift:156-169` —
  `convenience init(_:initialSource:)` calls `replaceCurrentItem(with: initialSource)`. Neither
  waits for a `VideoView`, a `play()`, or an explicit `replaceAsync`. **This invalidates the
  "mounted but cold" reading of the feed**: `FeedMovePage` renders
  `FeedMoveVideo` whenever `videoUrl && !failed`, independent of `active`, so with
  `windowSize={3}` two neighbours are buffering right now — and buffering *unbounded*, because
  nothing in the repo sets `bufferOptions`. Two consequences run through the whole plan: the
  thing to build first is a **bound** on prefetch that already happens, not prefetch itself; and
  any change that unmounts a neighbour (a lower `windowSize`) removes lookahead rather than waste.
- **`bufferOptions` is a settable property on a live player**, not a construction-time option
  (`VideoModule.kt:245-250`, `Property("bufferOptions").set`). A neighbour's buffer can therefore
  be bounded from an ordinary effect keyed on `active`, with no pool and no architectural change.
- **Detached-player preloading is officially the mechanism.** Expo's docs: a player "will
  fill the buffers" while not connected to a `VideoView`, and starts "without buffering" once
  attached. There is no `preload()` method; `createVideoPlayer` + `replaceAsync` is all of it.
- **`VideoSourceObject` is** `uri`, `assetId`, `drm`, `metadata`, `headers`, `useCaching`,
  `contentType`. Confirmed: **no `cacheKey`**. Cache identity is the full URL, query string
  included.
- **`BufferOptions` is richer than the draft assumed**: `preferredForwardBufferDuration`
  (Android 20 s, iOS 0 = auto), `minBufferForPlayback` (2 s, Android),
  `waitsToMinimizeStalling` (iOS), `prioritizeTimeOverSizeThreshold` (Android), and — the
  useful one — **`maxBufferBytes` (Android)**. A byte-bounded neighbour buffer is therefore
  reachable on Android with no byte-range fetcher; iOS's only lever is time.
- **`setVideoCacheSizeAsync` / `getCurrentVideoCacheSize` / `clearVideoCacheAsync` exist as
  described**, and both the size and clear calls are documented as valid *only while no
  `VideoPlayer` instance exists*. That makes app startup, before the first video screen
  mounts, the only safe place for the size call — and a sign-out cache clear has to run after
  navigation has torn every player down.
- **`PlayerBuilderOptions`** carries only `seekForwardIncrement` / `seekBackwardIncrement`
  (Android). There is no hook into Media3's `LoadControl` or preload manager.
- **Both open `useCaching` bug reports are closed** — expo#37850 as
  invalid, expo#43957 as missing-repro. #43957's underlying condition is real and narrow:
  iOS caching needs a `Content-Length` and fails with AVFoundation `-11849` on a
  `Transfer-Encoding: chunked` response. Supabase Storage sends `Content-Length`, so our URLs
  are fine; re-check only if a transformation proxy is ever put in front of them.

### Further source-level findings

- **A stable cache key is reachable today.** SDK 55 ships the new `expo-file-system` `File` API,
  `File.downloadFileAsync(url, destination)` included. Downloading a remote MP4 into `Paths.cache`
  under a filename derived from the **storage path** — never from the signed URL — supplies exactly
  the `cacheKey` that `VideoSourceObject` lacks: the URL may rotate on every refetch, the local file
  does not. `dance-post-grid.tsx` already does this for posters via `expo-image`'s
  `cacheKey: post.thumbnailPath`. This is option 4D below. It is client-side only, so it does not
  depend on the server fix, though it composes with it.
- **`replaceAsync` and `release()` race.** [#49981] fixes a case where `useVideoPlayer` released a
  player while a replacement was still in flight. Its diff is two lines of JavaScript *inside*
  `useVideoPlayer`, returning the `replaceAsync` promise so `useReleasingSharedObject` awaits it —
  so a pool built on `createVideoPlayer` with a manual `release()` gets nothing from it on any
  version. A slot must await its pending `replaceAsync` before `release()`, and that is ours to own
  on 55, 57 and 58 alike. Make it an invariant of the pool module with a test, not a code-review
  note. The same argument applies to [#46495]: a pooled surface does not call the hook.
- **An expired token does not evict the edge cache.** Supabase's CDN keys on the full signed
  URL, and once a response is cached it keeps being served for that URL until the CDN object TTL
  elapses — after the JWT's `exp`. Signed-URL memoization (4A) therefore widens the real access
  window from "TTL" to "TTL + CDN object TTL". That argues for a shorter object cache TTL on
  private media, not against memoizing.
- **Memoization has to survive more than one replica.** The server runs on Railway and may scale
  past one instance; a per-process `Map` then mints one URL *per replica* rather than one per
  object. Still a large win over one per request, but if the memo is meant to be authoritative it
  belongs on the row (`signed_url`, `signed_url_expires_at`), not in process memory.
- **`-g 60` is the wrong GOP for a practice surface.** A 2 s keyframe interval bounds seek
  accuracy at 2 s, and the lesson player loops sections, changes rate and scrubs — the three
  operations a sparse keyframe grid makes feel broken. Encode practice assets at a **1 s** GOP
  (`-g 30 -keyint_min 30 -sc_threshold 0` at 30 fps); on 15–60 s clips the bitrate penalty is
  small and it buys precise loop points on both platforms.
- **Playback rate changes the preload arithmetic.** `playbackRate` is 0–16 with `preservesPitch`
  defaulting to `true`. At 2× the forward buffer drains twice as fast, so a fixed
  `preferredForwardBufferDuration` is half the protection it looks like; scale it by the current
  rate. Slow rates are cheaper for the network but harder on some Android decoders, where sub-1×
  playback is a known source of dropped frames.
- **`generateThumbnailsAsync` deletes the poster fallback outright.** `DanceVideoCell` mounts a
  real `VideoView` in a grid whenever the server poster job has not landed yet. expo-video can
  produce a `VideoThumbnail` (consumable by `expo-image`) from the local capture at record time,
  so a user's own post has a poster before it has a server poster. That removes a decoder from a
  grid rather than merely deprioritising it.
- **Nothing requests a capture codec.** `record-dance-screen.tsx` sets `fileType: "mp4"` and a
  1.5 Mbps bit rate but never a codec, while `media-processor.ts` skips the music merge for any
  capture whose `codec_name !== "h264"`. If any device or OS version yields HEVC, that user
  silently loses the merged output and gets a clip some second-tier Android decoders will refuse.
  Assert H.264 at capture, and surface `skippedMergeReason` in telemetry rather than only in a
  column.
- **`react-native-video` v7 is still a beta line** (v6.19.x is stable). It pulls in
  `react-native-nitro-modules`, but that is **already a dependency** (`apps/mobile/package.json`,
  `^0.37.1`, required by `react-native-vision-camera@5`), so architecture C does not pay that cost
  twice. Its real cost is the second video stack in the binary.

### The feed already prefetches — without a bound

A `VideoPlayer` prepares its source at construction (see above), and `FeedMovePage` renders
`FeedMoveVideo` whenever `videoUrl && !failed`, independent of `active`. With `windowSize={3}`,
both of the active page's neighbours are therefore buffering right now — against Android's 20 s
default `preferredForwardBufferDuration`, with no byte cap, because nothing in the repo sets
`bufferOptions` at all.

The consequences run through the whole plan, and they are not the ones the obvious reading
suggests:

| The obvious reading | What is actually true |
| --- | --- |
| Neighbours are mounted but never told to buffer | They buffer from construction, up to Android's 20 s default, with no byte cap. |
| The first frame of the next page starts from zero bytes at swipe time | It starts from whatever the neighbour has already pulled — on a short clip, often all of it. |
| ~3 mounted players and no lookahead to show for it | ~3 players and ~3 *unbounded* buffers. The lookahead exists; the lookahead **is** the waste. |
| Dropping `windowSize` from 3 to 2 removes cost without benefit | It **removes lookahead**. A de-optimisation, not a cleanup. |

So the first thing to build is a **bound** on prefetch that already happens, not prefetch itself.
Because `bufferOptions` is a settable property on a live player, that bound is one effect keyed on
`active` inside `FeedMoveVideo` — no pool, no new module, no policy function. It is the ladder's
rung 1.

It also reframes the waste argument. The survey below cites the finding that blind full prefetch
wastes 40–60 % of what it downloads. On Android the feed does exactly that today, on two
neighbours, at 1.5–5 Mbps — a cost users pay on their data plan. The strongest argument for this
work is not "swipes are slow"; it is "we already prefetch, badly".

### The `audioMixingMode` defect: thirteen players, not two — fixed 2026-09-24

**An earlier pass of this document got the scope wrong, and the native source overturns it —
the fourth conclusion in this plan to be reversed by reading Swift instead of reasoning about
it.** The claim was that `ios/VideoManager.swift` recomputes the session only for a player
satisfying `isPlaying && !isMuted`, so a muted player could not trigger the `doNotMix` default.
That is true of `isOutputtingAudio` alone. It is not true of the mode itself:

- `findAudioMixingMode()` (`ios/VideoManager.swift:126-135`) filters `videoPlayers` on
  `player.isPlaying` **only** — mute is not part of the predicate;
- `doNotMix` has the highest priority of the four modes (`ios/Enums/AudioMixingMode.swift:12-23`),
  and a player's own default is `.doNotMix` (`ios/VideoPlayer.swift:18`), not the `auto` the
  TypeScript docblock advertises;
- so any *playing* player, muted or not, wins the vote, and `setAudioSession` then drops
  `.mixWithOthers` and calls `setActive(true)` — `doNotMixOverride` reaches both branches
  without `isOutputtingAudio`.

The blast radius is therefore every surface that plays video, the eleven silent ones included:
the feed, the catalog cards, the history grid and the record screen's reference clip each stop
the user's own music while showing no sound of their own. That is the larger half of the bug and
the one users meet first.

The fix, shipped in *Phase 0b*, is one shared module and one line per player:
`@bnewapp/mobile-kit/media/audio-mixing` exports `keepBackgroundAudio` (→ `mixWithOthers`) for
the eleven muted players and `takeOverBackgroundAudio` (→ `doNotMix`) for the two that carry
audio — `dance-post-detail-screen.tsx` (the merged clip with the music) and
`personal-video-section.tsx`. The second pair keeps today's behaviour but writes it down, which
is what survives the eventual upgrade, where the default changes. It is structurally typed like
`PlaybackController`, so `mobile-kit` still takes no `expo-video` dependency.

### The record screen holds two decoders, not three

It is tempting to read `record-dance-screen.tsx` as the tightest decoder budget in the app — a
reference player, a simulated-camera player and a live camera session. The code rules that out:

- `record-dance-screen.tsx:138` — `const simulatedRecordingEnabled = __DEV__ && simulatedRecordingToggle;`
- `:150` — the simulated player's source is `null` unless that flag is set, and a null-source
  player holds a native object but no decoder.
- `:457-479` — the simulated `VideoView` and the `Camera` are the two branches of a single
  ternary. They are mutually exclusive by construction.

Production is one reference player plus one camera session. The dev path is two players and no
camera. Neither reaches three. The surfaces that genuinely stack decoders are the **history grid**
(`dance-post-grid.tsx:174` mounts a player per cell whose poster has not landed — unbounded in the
length of the scroll) and the **feed** (three prepared players); the measurement plan is ordered
accordingly. One item still applies to the record screen: release the reference player while
recording if the reference is off screen.

### `surfaceType` is already chosen, and the feed's choice is the expensive one

`VideoView` defaults to `surfaceView` — lower power, better frame timing — but it neither
transforms nor overlaps well, which is why a mirror toggle (`scaleX: -1`) and overlapping
reference/camera views are the cases Android documents as `textureView` territory. The code
already sets **`textureView` on four surfaces**: `feed-move-page.tsx:127`, `pro-tip-screen.tsx:99`,
and `record-dance-screen.tsx:462,509` — the last of which a test asserts. The comment in
`feed-move-page.tsx` gives a real reason: Android composites a `SurfaceView` below the window, so
it neither follows a stack-push animation nor stays beneath the incoming screen.

But the feed is also the surface that holds three pages at once, and the power and frame-timing
arguments are strongest exactly there. This is an open *measured* decision, not a settled one:
`textureView` for the active page and `surfaceView` for buffered neighbours, or `surfaceView`
everywhere with a poster covering the transition, are both worth a measurement pass — and the
`videoChangeFrameRateStrategy` row below means the Pixel measurement has to happen anyway.

### Signing is non-deterministic — verified in the Supabase storage source

`ObjectStorage.signObjectUrl` builds the token with `signJWT({ url, scope: 'download', … }, key,
expiresIn)`, and `signJWT` is `new SignJWT(payload).setIssuedAt()`. `iat` is therefore *now* at
one-second resolution, and the signature moves with it: two `createSignedUrl` calls for the same
object **in the same second** produce a byte-identical URL, and two calls a second apart never do.
Consequences for remedy 4A:

- there is no "round the expiry" trick that makes independent replicas mint the same string —
  `exp` can be aligned to a window, `iat` cannot;
- so if the memo is meant to be authoritative across replicas it has to be **shared state** (the
  row, or Redis). A per-process `Map` still removes nearly all of today's misses, but it makes the
  CDN hit rate a function of replica count;
- minting the JWT ourselves with a rounded `iat` *would* be deterministic, but it needs the storage
  URL-signing key inside the API process. Not worth it.

### The `expo-video` version: what is upstream, and what is not

`expo-video` is at **57.0.4** on `latest` (SDK 57, React Native 0.86, released 2026-06-30) with the
**58.x** line on `next`; both apps pin `expo@55.0.28` and `expo-video@55.0.21` (published
2026-08-25). Several behaviours this plan depends on have already changed upstream — **none of them
in 55, and almost none of them in 57**. The decision that follows is in option 0; this section is
the evidence.

| Upstream change | Landed in | In SDK 57? | What it means here |
| --- | --- | --- | --- |
| `useVideoPlayer` calls `replaceAsync` on a source change instead of re-creating the player ([#46495]) | 58.0.0 | no | The "hook rebuilds the native player" finding is **version-specific**, not a property of the library. On 55 it holds, and the pool must live above the list. On 58 the hook becomes cheap to re-source and part of the pool's reason to exist evaporates. |
| Wait for a pending `replace` before releasing ([#49981]) | 58.0.3 | no | The race is **not** fixed in 55 — and, being hook-scoped, is not fixed for a pool on any version. A hand-rolled pool owns that invariant and owes it a test. |
| iOS: data race on the video cache's open-file registry, crashing while the cache is trimmed ([#49286]); uncatchable `NSFileHandleOperationException` when the device runs out of storage mid-write ([#49284]) | 58.0.0 | no | **Two known iOS crash classes inside precisely the feature option 3 turns on**, both triggered by the states a bounded LRU creates. The single strongest argument for preferring the local-file cache (4D), whose failure modes are ours to handle. |
| Caching takes Authorization / auth-related headers into account ([#45995]) | 58.0.0 | no | On 55 the video cache keys on the URL alone, so remedy **4B** (stable URL + bearer header) would let one cache entry serve **two different users' tokens on the same device** — a correctness and privacy hazard. 4B is off the table on 55. |
| Android `videoChangeFrameRateStrategy` player-builder option ([#47873]) | 58.0.0 | no | On adaptive-refresh displays (Pixel 9/10) ExoPlayer's default frame-rate matching can cap **the entire app UI at 30 Hz** while a 30 fps video is visible — the tempo bar and the feed scroll, not only the video. No knob on 55; measure it on a Pixel before blaming JS. |
| iOS `audioMixingMode` default corrected to `auto` ([#47363]) | 58.0.0 | no | On 55 the iOS default is `doNotMix`, which the documentation describes incorrectly. See the defect above. |
| Android hides the surface until the first frame after a source replace ([#44467]) | 56.0.0 | yes | On 55 a pooled player that `replaceAsync`es **keeps showing the previous clip's last frame**. A pool on 55 needs its own cover: a poster over the view until `readyToPlay`/first frame. |
| Recover failed players ([#46681]) | 56.1.3 | yes | On 55 a failed player stays failed. `feed-move-page.tsx:33` already works around this by remounting with `key={attempt}` — keep that while we stay on 55, and apply the same shape anywhere a pool can hit a load error. |
| iOS `VideoAssetTransportProvider` ([#44935](https://github.com/expo/expo/pull/44935)) | 56.0.0 | yes | A **native-only** registry for overriding asset loading — the sanctioned place to implement a custom cache key or transport on iOS. Costs a native module plus SDK 56+. Relevant only if 4D is ever judged insufficient. |
| iOS/tvOS minimum raised to 16.4 | 56.0.0 | yes | A one-constant change: `packages/mobile-kit/config-plugins/with-ios-min-deployment-target.js` holds a single `DEPLOYMENT_TARGET = "16.0"`, plus its test. |
| `maxResolution` player option; Media3 1.9.x | 58.0.0 / 56.0.0 | partly | Only matter if HLS ever ships. Recorded so the HLS deferral stays an informed one. |

#### SDK 57 is nearly empty, and SDK 58 is not shippable

`57.0.0` and `57.0.1` are both *"This version does not introduce any user-facing changes"*,
`57.0.2` carries two small iOS race fixes, and `57.0.3` / `57.0.4` have no entry on `main` at all.
An upgrade to 57 therefore deletes **two** workarounds from the table above, and both are the cheap
ones — the remount-on-error workaround is already implemented and costs nothing to keep.

`expo@latest` is `57.0.24`; `next` is `58.0.0-preview.6`, whose `bundledNativeModules.json` targets
**React Native 0.88.0-rc.1**. SDK 58 is not shippable, and `expo-video@58` cannot be pinned onto
SDK 57 because its `expo-modules-core` major differs.

#### The SDK 55 line is frozen, so the crashes will not arrive as a patch

Every `expo-video` release from `55.0.11` (2026-03-17) through `55.0.21` (2026-08-25) is recorded
as *"This version does not introduce any user-facing changes"*. Expo is not backporting to 55.
Waiting for a 55.0.22 that fixes the cache is not a strategy.

#### Both iOS cache crashes verified in the installed source

Against `node_modules/expo-video@55.0.21`, not against the changelog:

- `ios/Cache/VideoCacheManager.swift:16,26,30` — `openFiles: Set<URL>` is mutated by
  `registerOpenFile` / `unregisterOpenFile` with **no queue or lock**, while `fileIsOpen()`
  (line 180) is read from work dispatched on `cacheQueue`. The trim-time data race is real.
- `ios/Cache/MediaFileHandle.swift:119,131` — `writeHandle.write(data)`, the non-throwing
  Objective-C variant that raises an uncatchable `NSFileHandleOperationException` on `ENOSPC`.
- `ios/VideoPlayer.swift:18` — `var audioMixingMode: AudioMixingMode = .doNotMix`, confirming the
  default the documentation describes incorrectly for this version.
- `build/VideoPlayer.js` — still `useReleasingSharedObject(…, [JSON.stringify(parsedSource), …])`,
  confirming the hook rebuilds the native player on a source change.

**These crash paths only execute if `useCaching` is turned on.** Option 4D never touches them.
That is the decisive point: choosing the local-file cache over the library cache removes the
strongest argument for upgrading, rather than merely working around it.

#### The repo already patches `expo-video`

`patches/expo-video@55.0.21.patch` restores a `DefaultLoadControl.getAllocator(PlayerId)` overload
because **CameraX (via `react-native-vision-camera`) can upgrade Media3 to 1.9 at app runtime**
while `expo-video@55` builds against `media3 1.8.0` (`android/build.gradle:21`). Two consequences:

- an upgrade to 56+ (media3 1.9.x) would probably retire the patch — a real maintenance win,
  recorded here so it is not forgotten when the upgrade does happen;
- until then every version bump must rebase this patch, which sits exactly on the video/camera
  seam — the hardest place in the app to test.

The patch also only takes effect because both apps declare
`expo.autolinking.android.buildFromSource: ["expo-video"]` (`apps/mobile/package.json:6-14`,
`apps/edu/package.json:6-14`) — nothing else in the repo explains that block. It is a per-build
Android compile cost, and deleting it as apparent cruft would silently un-apply the patch and
reintroduce a runtime `NoSuchMethodError` on the camera screen.

### The download machinery is better than option 4D needs

SDK 54 introduced the object-based `expo-file-system` API, and its native tasks integrate with
`expo-task-manager`, so a download can proceed in the background and survive app termination (iOS
background `URLSession` completion handling is still being improved upstream —
[#50543](https://github.com/expo/expo/pull/50543)). Option 4D therefore need not be a foreground
`File.downloadFileAsync` that dies when the user leaves the screen, and **the same mechanism answers
option 7's resumable-upload problem**. One module, two problems, one place to get the retry and
cancellation semantics right.

### Lists: the feed is still a plain `FlatList`

`feed-screen.tsx` uses `FlatList` with `initialNumToRender={2}` and `windowSize={3}`. Once players
are pooled, the list matters less than it looks — but `getItemType` recycling and a tuned draw
distance are how both reference feeds got their numbers. FlashList v2 is a rewrite for the new
architecture (which both apps already run), is JS-only, and sizes items automatically; LegendList is
the newer Fabric/Reanimated alternative. Neither is a prerequisite for the pool. Sequence it after:
pool first, measure, and change the list only if the measurement points at the list.

### There is no telemetry infrastructure at all

`analytics|telemetry|posthog|sentry|amplitude|mixpanel` matches **nothing** across `apps` and
`packages`. "Add playback telemetry" is therefore a build-from-zero task, not an instrumentation
task, and it is the most expensive line available. The measurement plan below is ordered so that
the cheap measurements happen first and telemetry is only built if they leave a question open. Two
related gaps:

- `dance_moves` (`supabase/migrations/20260825192507_create_dance_moves.sql:60-87`) stores only
  URLs — no duration, resolution, codec or bitrate. Question 4 is answerable **without touching
  either app**, by running `ffprobe` over the public bucket URLs.
- `skippedMergeReason` is only logged (`media-worker.ts:161-165`), never persisted. A rate needs
  either a log query or one additive column.

[#44467]: https://github.com/expo/expo/pull/44467
[#45995]: https://github.com/expo/expo/pull/45995
[#46495]: https://github.com/expo/expo/pull/46495
[#46681]: https://github.com/expo/expo/pull/46681
[#47363]: https://github.com/expo/expo/issues/47363
[#47873]: https://github.com/expo/expo/pull/47873
[#49284]: https://github.com/expo/expo/pull/49284
[#49286]: https://github.com/expo/expo/pull/49286
[#49981]: https://github.com/expo/expo/pull/49981

### Relevant source files

- `apps/edu/src/features/feed/ui/feed-screen.tsx`, `feed-move-page.tsx`, `pro-tip-screen.tsx`
- `apps/edu/src/features/profile/ui/personal-video-section.tsx`
- `apps/mobile/src/features/dance/ui/dance-move-card.tsx`
- `apps/mobile/src/features/dance/ui/dance-post-grid.tsx`
- `apps/mobile/src/features/dance/ui/dance-post-detail-screen.tsx`
- `apps/mobile/src/features/dance/ui/learn-dance-screen.tsx`
- `packages/mobile-kit/src/media/use-focused-playback.ts`
- `packages/dance-flow/src/ui/record-dance-screen.tsx`, `dance-result-screen.tsx`
- `packages/dance-flow/src/api.ts`
- `apps/server/src/modules/dance/service.ts`, `media-worker.ts`, `media-processor.ts`
- `apps/server/src/modules/admin/dance-media-service.ts`
- `apps/admin/src/components/media-upload-input.tsx`

## How comparable products solve this

Four public, technically detailed implementations of the same problem (a full-screen
vertical short-video feed in React Native) converge on the same shape. Their numbers are
the useful part.

### Convergent architecture

| Concern | Mux "slop-social" | Widlarz `react-native-video-feed` | `expo-infinite-media` |
| --- | --- | --- | --- |
| Lookahead | 5 ahead / 1 behind | iOS 5 ahead, Android 3 ahead / 1 behind | next = prepared player, next+1 = bytes on disk only |
| Out-of-window | source set to `null` to free memory | lightweight placeholders | poster only |
| Players | FlashList recycling, one item type | pool of 3–5 reused ExoPlayer/AVPlayer | pool of 2–3 for a feed of any length |
| Prefetch depth | manifest + first segments, paused | `preload()` API (RN-Video v7) | ~1.5 MB of startup bytes + ~2 s buffered |
| Cache | served from cache on back-scroll | — | 500 MB video / 200 MB images, LRU, current+next pinned |
| Backpressure | — | destroy players on memory warnings | stop speculation when current buffer < 2 s; disable prep on flings > 2 pages/s |

Reported results are worth treating as targets, not promises: Widlarz measures ~19 ms TTFF
(~0–5 ms perceived), ~55 fps, < 5 ms scroll lag, and Android jank down from 24 % to 3 %
after pooling. FlashList is claimed at up to 5× UI-thread and 10× JS-thread FPS over
FlatList on low-end Android.

### The lessons that transfer directly

1. **Bounded ≠ unbounded.** The tempting reading of this lesson — "mounted ≠ preloaded, our feed
   gets no lookahead" — is wrong for our code; see *The feed already prefetches* above. Our feed
   *does* make neighbours buffer while paused, which is the mechanism these implementations
   describe. What it does not do is bound the amount, prioritise the active page over the
   neighbour, or stop under pressure. The gap between us and the references is therefore narrower
   than it looks on the swipe metric and **wider** than it looks on the data-waste metric.
2. **Partial prefetch beats full prefetch.** ~1.5 MB (roughly the first second or two of a
   faststart MP4) is enough to start playing. Downloading whole neighbour clips wastes
   the user's data and the CDN bill.
3. **Preloading must yield to playback.** Speculation stops when the current item's buffer
   is thin, on fast flings, on low-tier devices, and under memory pressure. This is the
   part naive implementations skip and then regret on Android.
4. **The Android decoder ceiling is device-declared, not a constant.** OEMs publish
   `concurrent-instances` in `/etc/media_codecs.xml`, and the runtime answer is
   `CodecCapabilities.getMaxSupportedInstances()`. Four is a common low-end value, not a
   specification: plan against four, and fail gracefully instead of assuming it. The surfaces at
   risk here are the **history grid** (`dance-post-grid.tsx:174`, a player per posterless cell)
   and the **feed** (three prepared players) — not the record screen, which holds two decoders in
   production.
5. **Prefetch the first chunk, not the clip.** Instagram buffers roughly the first chunk of a
   Reel and completes the download only after the viewer engages; TikTok warms 1–2 items
   ahead and pre-renders the first frame. Blind full prefetch is reported to waste 40–60 % of
   what it downloads — a data-plan cost our users pay directly.
6. **Keep the component, drop the source.** Mux's feed destroys nothing: FlashList recycles a
   single item type (`getItemType={() => "video"}`, `drawDistance = 3 × screen height`) and
   items outside the window are handed `null` instead of a URL. The pattern transfers to us;
   the implementation cannot, until the player is owned outside the item (see the
   source-level findings above).
7. **The window is asymmetric and platform-specific.** TWG ships 1 behind / 3 ahead on
   Android and 1 behind / 5 ahead on iOS, with a wider draw distance on iOS. Nobody preloads
   backwards by more than one page.

### Replay-heavy practice apps — the closer product analogue

The feed survey above is about *first* play. The lesson, pro-tip and record surfaces are about
*repeat* play, and the apps in that category converge on a different feature set than TikTok's.
STEEZY Studio is the closest product analogue, and public reviews of it repeatedly cite
stuttering — a reminder that a replay-heavy surface fails differently from a feed: it wants a
warm local copy far more than it wants adaptive bitrate. Our tempo bar, looping lesson player and
`pro-tip` screen sit in exactly that regime.

| App | Playback features | What it implies |
| --- | --- | --- |
| STEEZY Studio | speed control, section loop, mirror, front/back angle | several renditions per lesson (angles), precise loop points, no ABR requirement |
| Dance.io (Mirror & Loop & Slow) | mirror, A–B loop, slow motion over a saved video | the category assumes the asset is local before practice starts |
| Motion Player (Mirror & slow) | the same, plus frame stepping | frame stepping only works on a dense keyframe grid |

Two lessons transfer:

1. **A practice asset wants to be a local file, not a stream.** Every app in this category either
   starts from a local video or downloads first. A user looping eight bars twenty times on a
   flaky connection wants a download, not a buffering strategy. That is option 4D applied to
   lesson and reference clips, and on this surface it is a stronger lever than preloading.
2. **Mirror and angles are cheap product wins with real technical prerequisites.** Mirror is a
   view transform — and a `textureView` on Android. A second angle is a second asset, which is an
   argument for encoding on ingest (option 5), not for ABR.

### The download-first category, concretely

A practice asset wants to be a local file, and the consumer category has already converged on a
*product* shape for that, not merely a cache:

| App | Shape of the feature | The detail worth copying |
| --- | --- | --- |
| obé Fitness | "Offline mode": classes the member explicitly saves | **capped at 30 saved classes** |
| Apple Fitness+ | per-workout download, kept in a library | downloads run 1 GB+, and the app warns about cellular |
| MasterClass / Nike Training Club | per-lesson download for offline viewing | the unit of download is the **lesson**, not the session |

Three things transfer: the download is **user-visible and user-managed** (a list, a delete, a
storage figure), it is **capped**, and its unit is **one lesson**. That fits our practice surfaces
better than an invisible LRU does — and since both are the same `expo-file-system` machinery,
option 4D can ship as an invisible cache first and grow the UI later without re-plumbing.

Note also *why* those apps need heavyweight offline stacks — Media3 `DownloadManager` on Android,
`AVAssetDownloadURLSession` on iOS — namely that HLS cannot simply be copied to disk. Progressive
MP4 needs none of it: a file download is the entire implementation. One more reason the HLS
deferral is right for our durations.

### Byte budgets, restated as numbers

Reported figures to size the neighbour budget against: a "minimal viable" Reel is ~**215 KB** and a
full prefetch ~**715 KB**; TikTok warms the **first frame and metadata 1–2 items ahead**; and
viewport-based preload is credited with a **30–40 % reduction in black-frame time during fast
scrolls**. A 1.5–2 MB neighbour budget is therefore generous rather than tight. Start around
2–3 s / ~500 KB–1.5 MB, and tune against **preload hit rate**, not against the byte count alone.

Measured against what we do today these are not targets to grow into but ceilings to come down to:
the feed's neighbours currently buffer against Android's 20 s default with no byte cap at all. A
1.5 MB neighbour bound is roughly an order-of-magnitude reduction per swipe, not an addition.

### What the preloading literature adds

Short-video preloading has its own research line, and it agrees with the industry blogs about
the shape while being more precise about the trade-off:

- Preloading is formally a *stall vs. waste* optimisation. APL, evaluated on a TikTok dataset,
  reports an 81 % stall-ratio reduction against no preloading and 12 % against a fixed preload,
  by varying how much of each upcoming video it fetches instead of using a constant.
- Later work — DRL-based preload algorithms, demand-driven preloading with watch-time estimation,
  bandwidth-efficient multi-video prefetching — optimises the same two axes and reaches the same
  conclusion: the *amount per item* should follow buffer level and bandwidth, and the *depth*
  should follow how likely the user is to reach the item.
- The distillation for a product our size: do not tune a constant. Make the preload amount a
  function of (current buffer, connection class, playback rate) and the depth a function of
  scroll velocity. Architecture A already proposes exactly that pure policy function; the
  literature is the argument for it being a function rather than a number.

Akamai's ExoPlayer guidance is the concrete counterpart on the buffering side: ExoPlayer wants
roughly 2.5 s of buffered media before it starts, and lowering that lowers TTFF at the cost of
startup rebuffering. `bufferOptions.minBufferForPlayback` (default 2 s) is the `expo-video`
handle on that exact trade-off, and it is the one knob that moves Android TTFF with no
preloading at all.

### Platform reality on caching

- `expo-video` caching works for progressive MP4 on both platforms, and for HLS on Android
  (ExoPlayer/Media3). **HLS cannot be cached on iOS** — AVPlayer has no one-line disk cache
  for a manifest tree; `AVAssetDownloadTask` targets long-form downloads, not feed caching.
- The community workaround is a localhost proxy (`expo-video-cache`, GeekyAnts): the player
  gets `http://127.0.0.1:9000/proxy?url=…`, the proxy rewrites manifests and caches segments.
  Cost: ~2.5 MB iOS binary (an embedded Swift HTTP server), a new failure mode, and a
  custom-native-module dependency in an Expo app that is currently plugin-light.
- Therefore **choosing HLS is choosing to lose iOS disk caching, or to adopt a proxy.**
  For 15–60 s clips that is a bad trade.

### Format guidance from the encoding side

Industry guidance is consistent: progressive MP4 is the right delivery for short-form
(< ~2 min, and emphatically < 30 s); ABR earns its complexity when a clip is long enough for
a connection change to drain the buffer. Where HLS is used, ~6 s segments with ~2 s
keyframes is the VOD default (2 s segments are a low-latency-live concern, not ours).

**Conclusion for this product: keep progressive MP4 as the delivery format.** The real wins
are in (a) not fetching what nobody watches, (b) prefetching a little of what they are about
to watch, (c) caching what they replay, and (d) encoding sources sanely — not in HLS.

## Candidate architectures

The numbered options in the next section are components. These are the three coherent ways
to assemble them, and they differ in cost and risk, not merely in polish. They are **not** a
choice to take up front: the feed-first pilot in *Phase 1* reaches B by rung 2 and A at rung 3,
and stops at whichever one hits the target.

### 0. Which `expo-video` are we building on? — **decided: stay on SDK 55**

**Do not upgrade, and specifically do not upgrade first.** The evidence is in *The `expo-video`
version* above; the decision follows from three facts.

1. **SDK 57 buys two cheap workarounds, not four.** Everything this plan depends on —
   the two iOS cache crashes, the hook's `replaceAsync`, the `audioMixingMode` default, the auth
   header cache key, `videoChangeFrameRateStrategy` — is in **58**, which is `next`
   (`expo@58.0.0-preview.6`, React Native 0.88.0-rc.1) and not shippable.
2. **The fixes that matter most do not apply to architecture A anyway.** A pool owns
   `createVideoPlayer` and `release()` directly, so both [#46495] and [#49981] — hook-scoped
   changes — leave its invariants exactly where they were.
3. **Choosing 4D over `useCaching` retires the risk instead of deferring it.** The two iOS crash
   paths verified in the installed source only execute inside the library cache. A local file
   cache never enters them, on any version.

The cost side, measured against `bundledNativeModules.json` for `expo@57.0.24`:

| | current | SDK 57 |
| --- | --- | --- |
| react-native | 0.83.10 | **0.86.3** |
| react / react-dom | 19.2.0 | 19.2.3 |
| react-native-reanimated | 4.2.1 | **4.5.1** |
| react-native-worklets | 0.7.4 | **0.10.1** |
| gesture-handler / screens / safe-area-context / svg | — | all move |
| 16 `expo-*` packages | 55.x | 57.x |

Plus the packages the SDK does not pin, each needing its own RN 0.86 verification —
`nativewind@4.2.6`, `react-native-vision-camera@5.2.3`, `react-native-mmkv@3.3.3`,
`react-native-nitro-modules@0.37.1` — plus rebasing `patches/expo-video@55.0.21.patch`, across two
Expo apps, on top of the Xcode 27/26 split this repo already maintains.

**Reopen the question only when one of these is true:**

- SDK 58 reaches stable — then upgrade for the whole set at once, skipping SDK 56's
  Hermes/worklets memory regression;
- Phase 0 measures the Pixel 9/10 30 Hz UI cap as a real defect — it is the one item with no
  JavaScript workaround, and its knob exists only on 58. **No Pixel 9/10 is available
  (2026-09-24), so this trigger is untestable today.** Treat adaptive-refresh Android as an open
  risk rather than a cleared one, and borrow or rent a device before concluding the feed is smooth
  on Pixel-class hardware;
- a reason unrelated to video (App Store requirement, security, an RN feature) forces it — at
  which point the upgrade is its own project with its own plan, not a line inside this one.

**Do now, separately and cheaply:** the repo is on `expo@55.0.28` (2026-07-15) while the 55 line is
at `55.0.31` (2026-08-31). A patch bump inside the same SDK is near-zero risk.

### A. An owned player pool on `expo-video` — recommended

One module under `packages/mobile-kit/src/media/` owns two or three players created with
`createVideoPlayer`, moves them between pages with `replaceAsync`, and releases them on
teardown. List items *receive* a player; they never create one. Public MP4 sources carry
`useCaching: true`, the cache is bounded at startup, neighbours get a capped buffer
(`maxBufferBytes` on Android, a 2–3 s `preferredForwardBufferDuration` on iOS) while the
active page keeps the defaults, and a pure, unit-tested policy function decides whether to
speculate at all.

- **Buys:** the instant swipe, warm replay on the lesson and record surfaces, a decoder count
  we actually control, no new native dependency, no divergence from the SDK 55 upgrade path.
- **Costs:** we hand-roll, in JS, a smaller version of what Media3's `DefaultPreloadManager`
  does natively; manual `release()` becomes our bug to make. Roughly a week with tests.
- **Now carries the local-file cache too (option 4D).** The pool answers the swipe; the file
  cache answers the replay, and that half depends on no server change at all. Ship both behind
  one module boundary in `packages/mobile-kit/src/media/`, with the pool awaiting each pending
  `replaceAsync` before `release()` (expo/expo#49981).
- **Fits** because every asset is short-form progressive MP4 and the product's promise is
  *repeat* play (lesson loops, tempo drills, replaying your own dance), not first play of a
  long stream. The practice-app survey above is the strongest evidence for this reading: every
  comparable dance app optimises the local, looped replay rather than the cold start.

### B. Hygiene only — poster-first lists, one player per surface

Ship option 1, the cache budget in option 3, and the server-side signed-URL fix in option 4A.
No preloading.

- **Buys:** the Android decoder margin and most of the wasted download, in one to two days.
- **Costs:** swipe latency stays exactly where it is.
- **Use as** the floor, not the alternative: B is A's first slice, so none of it is thrown
  away. Stop at B only if Phase 0 says swipe latency is already acceptable.

### C. Move the feed to `react-native-video` v7

v7 exposes what `expo-video` does not: a player entity independent of the view,
`replaceSourceAsync`, a real `preload()`, Android `SimpleCache` sizing — and on Android it
sits on Media3, whose `DefaultPreloadManager` + `TargetPreloadStatusControl` were designed for
this exact feed shape ("hold the first five seconds of the next three items"). TWG's
MIT-licensed `react-native-video-feed` is a working Expo reference (Legend List, 1 behind /
3 ahead on Android, 1 behind / 5 ahead on iOS, draw distance 2× / 3× screen height).

- **Buys:** the strongest preload primitives available in React Native today, plus somebody
  else's tuning of them.
- **Costs:** a **second video stack in the binary**. `expo-video` is used in ~10 surfaces
  across `apps/mobile`, `apps/edu` and `packages/dance-flow`; either all of them migrate, or
  we ship two independent decoder accountings on the platform where decoder count is the
  binding constraint. Add a config plugin, a still-beta dependency line (v6.19.x is
  the stable one), `react-native-nitro-modules` alongside it, and drift from the Expo SDK
  upgrade train.
- **Choose only if** A is measured and still misses the swipe target, or if a long-form/HLS
  lesson surface appears and iOS HLS caching becomes mandatory.

**Recommendation: A (pool + local-file cache), shipped so that B is its first release, with C
held as an escape hatch gated on the Phase 0 numbers.**

Within A, **the local-file cache (4D) outranks `useCaching`** rather than merely complementing it:
on 55 it avoids two known iOS cache crashes, it is the only mechanism immune to rotating signed
URLs, and it is what every comparable practice app does. That also weakens C's case rather than
strengthening it — a second video stack buys preload primitives, and what the practice surfaces
actually want is a local file. A's two known risks (the `replaceAsync`/`release` race and the
decoder budget on the grid and the feed) are its to manage either way.

The **delivery** matters as much as the choice. A is not committed to up front: it is *earned* one
rung at a time on a single surface — the Stepz feed — under the ladder in *Phase 1*. A's module
boundary (`packages/mobile-kit/src/media/`) is fixed from the start so the pool is reusable when it
is built; whether it gets built at all is a measurement outcome, not a plan commitment.

## Technical options

### 1. Poster-first lists, one active player

- Move picker: thumbnail by default, mount one player for the selected card.
- Recorded-dance grid: always render poster/blurhash/placeholder; never substitute a full
  `VideoView` because the asynchronous poster job has not finished (`DanceVideoCell`).
- Lesson paging: keep the active player; retain an adjacent one only after profiling.

Cheapest change, biggest safety margin against the ~4-decoder Android ceiling.

### 2. Real preloading in the Stepz feed

The pattern that matches `expo-video`'s API surface:

- Keep exactly one *playing* player (the active page).
- For the next page (and only the next), hold a **detached** `VideoPlayer` — constructed
  with a source but never attached to a `VideoView`, or constructed with `null` and fed via
  `player.replaceAsync(source)`. Expo documents this as the preloading mechanism; a
  detached player fills its buffer without rendering.
- Give sources `useCaching: true` so the prefetched bytes survive into the cache and a
  back-swipe is instant.
- Tune `bufferOptions.preferredForwardBufferDuration` down for neighbours (a few seconds is
  enough to hide the swipe) and leave the active player at the default (Android 20 s). This one
  is **not** gated on the pool: `bufferOptions` is settable on a live player, so the same bound
  applies today from an effect keyed on `active` (ladder rung 1). It is also the *only* item in
  this list that the current code makes urgent rather than aspirational — today the neighbours
  buffer against that 20 s default.
- Gate speculation: skip it while the active player's buffer is thin, during fast flings,
  and on low-memory devices. Expose it as one pure policy function so it is unit-testable
  without a device (`packages/mobile-kit/src/media/`).
- Reduce `windowSize` to 2 **only in the same change that gives the pool responsibility for the
  next page.** Mounting is not standing in for preloading; on SDK 55 it *is* the preloading
  (constructor prepare), so lowering the window before a detached player exists deletes lookahead
  rather than waste.

`expo-video` has no `preload()` method (that is RN-Video v7) and no byte-range fetch API, but
the byte budget is still expressible: **Android** takes `bufferOptions.maxBufferBytes`
(≈1.5–2 MB for a neighbour), and **iOS** takes `preferredForwardBufferDuration` (2–3 s),
because AVPlayer's lever is time rather than bytes. A detached player under those limits *is*
the "first chunk only" behaviour Instagram describes. Do not build a byte-range fetcher.

Because the hook rebuilds its player on any source change, the pool must live above the list:
`createVideoPlayer` per slot, `replaceAsync` on window moves, `release()` on unmount. A list
item that calls `useVideoPlayer` cannot participate in a pool.

### 3. Bounded caching for stable public MP4s

Set a deliberate LRU budget at startup with `setVideoCacheSizeAsync` **before any player
exists** (default is 1 GB, which is not a budget). 200–500 MB matches what comparable feeds
allocate. `getCurrentVideoCacheSize` and `clearVideoCacheAsync` cover a dev-menu "clear
media cache" action; `clearVideoCacheAsync` only works when no `VideoPlayer` instance
exists, so it belongs on a screen with no video on it.

Best candidates (all public, immutable, replay-heavy):

- reference clips shown during recording;
- the selected lesson video and its pro-tip clip;
- recently-watched feed moves.

Do not cache every video in a scrolling list. The OS can evict at any time; treat the cache
as an optimisation, never as storage.

### 4. Make private UGC cacheable — the signed-URL fix

This is the highest-leverage *server* change, and it is cheap. Today every response mints a
fresh signed URL, so:

- Supabase Smart CDN keys on the token-bearing URL → guaranteed origin hit every time;
- `expo-video`'s cache keys on the URL and has no `cacheKey` override → guaranteed cache
  miss every time.

Three remedies, in increasing cost:

| Remedy | Shape | Trade-off |
| --- | --- | --- |
| **A. Memoize the signed URL server-side** (recommended) | Cache `path → { url, expiresAt }` in the service, reuse until a refresh margin (e.g. re-sign at 80 % of a 1 h TTL). Every client in that window gets the *same* string. | ~20 lines, no new infrastructure, no auth-model change. Warms both CDN and device cache. Bounded exposure window unchanged from today's 1 h profile TTL. |
| **B. Stable authenticated route** | `GET /api/dance/posts/:id/video` with `app.authenticate`, streaming the object with `Range` support. `VideoSourceObject.headers` can carry the bearer token, so the URI is stable and cacheable. | Railway egress now pays for every byte; needs correct `Range`/`206` handling. A redirect to storage would defeat the whole point (the final URL rotates again). |
| **C. Keep UGC uncached** | Accept it; optimise encoding only. | Simplest; leaves replay of one's own dances slow. |

| **D. Cache the bytes locally under a stable key** *(client-side; composes with A)* | `File.downloadFileAsync(signedUrl, target)` where the filename is a hash of the **storage path**, then play the `file://` URI. A small LRU over `Paths.cache` with a byte budget and a sign-out purge. | Immune to URL rotation and to the missing `cacheKey`. The *first* play still streams; only the replay benefits. Costs a cache module we own and a purge policy. |

Start with **A**. It requires no product/security decision, unlike making the bucket public
(which should not be done merely to improve caching).

**A and D are complements, not alternatives.** A makes the first play cacheable for everyone
(CDN and device); D makes the repeat play instant no matter what the server does, and it is the
only mechanism that survives a URL guaranteed to rotate. For lesson and reference clips — public,
immutable, watched many times per session — D is also a simpler story than `useCaching`: no iOS
HLS caveat, no "only while no player exists" lifecycle rule, and an eviction policy we choose.
Use `useCaching` in the feed, where an asset is watched once and is cheap to lose; use a
downloaded file wherever an asset is *practised*.

Also decide the logout policy: if UGC is ever cached on device, `clearVideoCacheAsync` must
run on sign-out — and it can only run when no player exists, so it belongs in the sign-out
path after navigation settles.

### 5. Encode on ingest instead of adopting HLS

Neither source path is encoded today: admin accepts whatever MP4 is uploaded, and the media
worker uses `-c:v copy`. A 4K 20 Mbps lesson clip from a phone will be delivered verbatim.
An ingest normalisation step is strictly more valuable than an ABR ladder for our durations:

- normalise to 1080×1920 (cap the long edge), H.264 High, 30 fps, `+faststart`, AAC 128 kbps,
  and a **1 s keyframe interval** (`-g 30 -keyint_min 30 -sc_threshold 0`) rather than the usual
  2 s VOD default — loop points, scrubbing and rate changes are all bounded by the keyframe grid,
  and these clips are far too short for the bitrate penalty to matter;
- target ~3–5 Mbps for 1080p vertical dance (high-motion content compresses badly — do not
  go below ~3 Mbps at 1080p), or ~1.5–2.5 Mbps at 720×1280 if measurement says the feed
  should ship 720p;
- optionally emit a single 540×960 "low" MP4 and select it client-side from
  `NetInfo`-reported connection type — a one-step "poor man's ABR" that keeps the iOS cache
  working, unlike HLS.

Adopt HLS only if a *long-form* lesson surface appears (multi-minute classes). At that point
the ladder should come from production source analysis, not from this document.

### 6. Managed video provider — only if ingest encoding becomes a burden

We already run FFmpeg in a worker on Railway, so an encode step is incremental rather than
new. Costs for comparison, if that changes:

| Provider | Encoding | Delivery / storage | Notes |
| --- | --- | --- | --- |
| Cloudflare Stream | free (bundled) | $5 / 1 000 min delivered, $1 / 1 000 min stored | Signed tokens up to 12 h, geo/IP restrictions, optional MP4 downloads (needed for our iOS cache path), HLS/DASH manifests |
| Bunny Stream | free H.264 (premium codecs $0.025–$0.150/min) | cheapest per-GB of the three | Token + domain auth, DRM, TUS resumable uploads, EU-centric CDN |
| Mux | $0.07/min | $0.025/min delivered | Best analytics (startup time, rebuffer, failures reported per playback); 5–8× the cost |

At our current scale Bunny is the cost floor and Cloudflare the operational sweet spot;
Mux's value here is its **playback QoE analytics**, which is exactly what the measurement
plan below has to build by hand otherwise. That is a real argument for piloting Mux on one
surface even if delivery stays with Supabase.

### 7. Upload resilience — a separate track

`File.bytes()` holds the whole clip in JS memory with a 64 MB ceiling and no resume. If
maximum duration or quality grows, move to TUS (Supabase Storage supports it; Bunny does
too) or a background upload path with progress, retry and cancellation. This improves
recording-to-review, not playback startup.

### 8. Practice-surface playback — the dance-specific concerns

None of the feed literature covers these, and they are where this product differs from a feed.

- **Loop points.** `loop: true` restarts at 0. A section loop — STEEZY's core feature and the
  natural partner to the tempo bar — needs a `timeUpdate` listener that seeks back to the section
  start, which makes seek cost a product feature rather than a detail. Dense keyframes (option 5)
  and a local file (option 4D) are what make it feel instant.
- **Rate.** `playbackRate` (0–16, `preservesPitch` default `true`) is already wired to the tempo
  bar. Two consequences: scale any forward-buffer target by the current rate, and verify sub-1×
  playback on a mid-tier Android device before shipping a slow-motion drill.
- **Mirror.** A `scaleX: -1` transform on the `VideoView`; on Android it needs
  `surfaceType="textureView"`, which costs power. Scope the toggle to the lesson surface.
- **Concurrent decoders.** In production `record-dance-screen.tsx`
  holds a reference player plus a camera session: the simulated player is already `__DEV__`-gated
  (`:138`), carries a `null` source when off (`:150`), and is mutually exclusive with the `Camera`
  in the JSX (`:457-479`). Two decoders, not three. The surfaces that actually stack against a
  common low-end ceiling of four are the **history grid** (a player per posterless cell) and the
  **feed** (three prepared players). What still applies to the record screen: release the
  reference player while recording if the reference is off screen.
- **Audio.** Set `audioMixingMode` deliberately on any player that is **unmuted** — a muted
  player cannot trigger the iOS `doNotMix` default at all. Today that is exactly
  `dance-post-detail-screen.tsx:37` and `personal-video-section.tsx:34`, and it is a shipping bug
  rather than a precaution (*Phase 0b*).
- **Posters.** `generateThumbnailsAsync` produces an `expo-image`-compatible thumbnail from a
  local file. Generate the user's poster at record time so the grid never falls back to a live
  `VideoView`, and treat the server poster as the durable copy rather than the first one.

### 9. Prefetch on intent, not on scroll

The feed literature prefetches against a *prediction* (the user will probably swipe). Our practice
surfaces do not have to predict anything — the user declares intent well before playback:

- tapping a move card in the picker, several hundred milliseconds to several seconds before the
  lesson screen's player mounts;
- opening a lesson, before the intro/tempo chrome is read;
- entering the record flow, whose reference clip is known from the route param.

Start the fetch at the declaration, not at mount. It is the cheapest latency win in the document —
no pool, no policy function, no server change — and it composes with everything else: warm the
local file (4D) if we have that, otherwise just create the detached player early. The only rule is
that it must be cancellable, because intent is frequently withdrawn.

### 10. "Save for practice" — option 4D grown into a feature

If question 7 is answered yes, the category shape above is the one to copy: an explicit save, a
visible list with a storage figure and a delete, a **cap** (obé's 30 is a sane starting number), and
a per-lesson unit. Implementation is the same module as 4D — a stable filename derived from the
storage path, an LRU under a byte budget, a sign-out purge — plus a pinning concept so an explicitly
saved lesson is never the thing the LRU evicts, and background downloads via `expo-file-system` +
`expo-task-manager` so leaving the screen does not cancel the save.

Ship it invisible first (4D), and only add the UI once measurement shows the practice surfaces
actually hit the local copy. The invisible version is a prerequisite for the visible one; the
reverse is not true.

## Measurement plan — three tiers, cheapest first

The obvious first step, "add playback telemetry", is the wrong one: the repo has **no analytics
infrastructure of any kind**, so that is a build-from-zero task and the single most expensive line
available. It sits in tier C, reached only if tiers A and B leave a question open.

### Tier A — measurements that touch neither app (a day)

**A1 — done 2026-09-24. Full results in
[the catalog asset statistics](video-playback-catalog-assets-2026-09-24.md).** It answers
decision 4 and changes what this document assumed about `moov` placement, frame rate and
delivery headers. Headline numbers, over 1,086 `dance_moves` rows and the **3,829 published
objects in the `dance-media` bucket**:

| Measure | Result |
| --- | --- |
| Migration state | all 808 published moves have a complete copy in `dance-media/moves/<legacy_id>/`; **rows repointed 2026-09-24**, 241 fields left on S3 for want of an object |
| Delivery | `video/mp4`, Cloudflare in front, `cache-control: max-age=31536000`, `cf-cache-status: HIT` |
| `+faststart` | **66 / 3,828 (1.7 %)**; **0 %** on `main`, `dancer-tip`, `presentation` |
| Codec | h264 200/200 sampled, High profile, yuv420p, 720×1280 dominant |
| Frame rate | **60 fps 87 %**, 30 fps 13 % |
| Duration / bitrate | median 9.6 s / 1.20 Mbps; p90 32.9 s / 1.92 Mbps |
| Keyframe interval | median GOP **4.167 s**, p90 8.333 s; 48/50 clips above 2 s |
| Needs re-upload | the 210 published moves whose Boogiz `pro_dancer_video_url` 403s were skipped by the migration |

A method note worth carrying: `-skip_frame nokey -show_frames` is **not** a valid keyframe probe
on this corpus — its frames carry no `pts_time`, so it reports one keyframe per clip. Use
`-show_entries packet=pts_time,flags` and count the `K` flag.

**A2 — not answerable on the available database (2026-09-24).** `skippedMergeReason` is still
only logged (`media-worker.ts:161-165`), but a proxy needs no column: a `dance_media_jobs` row
that is `completed` while its post's `merged_video_path` is null is a skipped merge, and
`music_id` separates "no music track" from "unsupported video codec". The proxy returns
**5 jobs, all completed, all merged, zero skips** — n=5 is not a rate. Record A2 as *unmeasured*,
not as passed. Answering it needs the production database, if the project in `apps/server/.env`
is not it, or the additive `skipped_merge_reason` column so the question becomes SQL once volume
exists. `media-processor.ts:238` already emits `unsupported video codec: <name>`, so the answer
would identify the offending devices too.

### Tier B — physical-device measurements that need no telemetry (two to three days)

Driven with argent plus the platform tools. Nothing here requires an app change.

| Question | Instrument | Surface |
| --- | --- | --- |
| Swipe → first frame | `screen-recording-start/stop`, count frames from finger-lift | Stepz feed |
| Tap → first frame | the same | move picker → `learn-dance-screen` |
| Concurrent decoders (Android) | **`adb shell dumpsys media.resource_manager`** is the one that reports live clients per pid; `media.metrics` gives lifetimes but reports `renderFrameCount` as 0 on MediaTek, and `media.player` gives capabilities only. Device ceiling from `concurrent-instances` in `/vendor/etc/media_codecs*.xml` | **Feed measured 2026-09-24** ([result](video-playback-android-baseline-repointed-2026-09-24.md)): 2 hardware AVC decoders on a fresh feed, **6 after 32 swipes and never released**, with ≥25 decoder destructions in a 49 s swipe window (median lifetime 7.2 s). Still open: the **history grid** (a player per posterless cell, unbounded in the length of the scroll) and `record-dance-screen.tsx` — which holds two decoders in production, not three |
| Bytes transferred per swipe | `adb shell dumpsys netstats` on Android, a throttling proxy on both; compare bytes moved for one swipe against the clip size | Stepz feed — sizes the unbounded neighbour buffer, which is what ladder rung 1 reclaims and what a latency-only baseline cannot see |
| Pixel 9/10 30 Hz UI cap | `adb shell dumpsys display` while a 30 fps video plays; drag the tempo bar and watch for judder | feed and `learn-dance-screen` — **blocked: no Pixel 9/10 available (2026-09-24)** |
| `surfaceView` vs `textureView` | flip the prop, record, compare power and frame timing | `feed-move-page.tsx:127` |
| JS re-renders / jank | `react-profiler-start/stop` → `react-profiler-renders` | feed during fast flings |
| Native hangs, CPU (iOS) | `native-profiler-start/stop` | record screen and feed |

**Fixed scenario, unchanged across every before/after run** — this is what makes the numbers
comparable at all: cold start → feed, 20 ordinary swipes → 10 fling swipes → one lesson, loop a
section 10 times, change tempo three times, scrub → record one clip and replay it → scroll the
history grid to the end. Physical iOS **and** Android, Wi-Fi **and** throttled cellular. Freeze
three sample moves as the corpus on day one and never change them.

### Tier C — in-app telemetry, only if A and B leave the cause unknown

Do not build an analytics pipeline. Build two things:

**C1. One hook, in the shared seam.** `packages/mobile-kit/src/media/use-playback-telemetry.ts`,
beside `use-focused-playback.ts` — the one module both apps and `dance-flow` already import, so a
single hook reaches every surface without crossing a package boundary. It takes the player plus
`{ surface, url }` and records:

1. request/play intent time;
2. player source loaded time (`statusChange` → `readyToPlay`);
3. first-frame-render time (TTFF);
4. buffering start/end and cumulative stalled time (`statusChange` transitions);
5. playback error and URL/HTTP failure category;
6. played duration, completion, and seek behaviour;
7. source dimensions, duration, encoded bitrate/size, and whether it was a cache hit;
8. **feed-specific:** swipe → first frame on the *next* page, and preload hit rate
   (fraction of swipes landing on an already-warm player).

**C2. A debug HUD, not a backend.** `@bnewapp/mobile-kit/ui/dev-menu` already takes a `toggles`
array (`apps/mobile/src/features/dev-menu/dev-menu.tsx` passes two). One more toggle renders an
overlay with the active player's TTFF, stall count and cache hit/miss. That puts the numbers on a
real device with no server, no vendor decision and no SDK.

Every `useVideoPlayer` call site, should instrumentation ever need to be exhaustive:
`feed-move-page.tsx:99`, `pro-tip-screen.tsx:72`, `profile-move-screen.tsx:92`,
`personal-video-section.tsx:34`, `scan-result-screen.tsx:70`, `replace-video-screen.tsx:89`,
`learn-dance-screen.tsx:192`, `dance-move-card.tsx:103`, `dance-post-grid.tsx:174`,
`dance-post-detail-screen.tsx:37`, `record-dance-screen.tsx:145,149`,
`dance-result-screen.tsx:32`. Four of them are representative enough to start: the feed (first
play), the lesson (replay), the post detail (rotating signed URL), the record screen (decoder
pressure).

### Targets

Suggested initial targets (to validate, not yet a product contract):

| Metric | Wi-Fi | Typical cellular |
| --- | --- | --- |
| Median TTFF, cached/short reference clip | under 500 ms | under 1 s |
| p95 TTFF, lesson | under 2 s | under 4 s |
| Feed swipe → first frame (preload hit) | under 150 ms | under 300 ms |
| Rebuffer ratio | under 1 % | under 3 % |

## Recommended phased roadmap

### Phase 0 — baseline (tiers A and B; no app change)

**Partial result, 2026-09-24:** the [physical Android Wi-Fi Stepz feed baseline](video-playback-android-baseline-2026-09-24.md)
captured 30 forward page transitions. The app received 180.7 MiB during the session, an
app-wide average of 6.02 MiB per transition. A uniform app-background region occupied the
centre of the video area for 27.2 s across 24 intervals (median interval 0.83 s; longest 3.93 s).
The recording has no touch-release marker, so these are visible blank intervals, **not** measured
swipe-to-first-frame times. That run measured the legacy S3, tail-`moov` copies; it was
**re-measured the same day against the repointed and remuxed corpus**
([result](video-playback-android-baseline-repointed-2026-09-24.md)), on the same device and
network and over the same 30 transitions between the same two moves: blank video fell to 17.20 s
across 17 intervals (0.57 s per transition, median 0.67 s, longest 3.73 s) while received bytes
per transition **rose** to 9.79 MiB. A separate reading put an untouched, looping page at
145.6 KB/s — the clip is re-downloaded every loop. `dumpsys media.resource_manager` closes the
open decoder-count item: a fresh feed holds 2 hardware AVC decoders, and after 32 swipes the
process holds 6 and does not release them. An [iOS Simulator diagnostic](video-playback-ios-simulator-baseline-2026-09-24.md)
then recorded 30 transitions and 23.1 s of uniform blank-video time across 16 intervals
(median 0.82 s; longest 8.17 s). **Replaying the identical saved flow against the repointed and
remuxed corpus** ([result](video-playback-ios-simulator-baseline-repointed-2026-09-24.md)) left
6.03 s across 3 intervals, **all of them before the first swipe**: on the simulator the feed now
shows no empty media at all while paging. That isolates the remaining Android cost as decode
capacity and link speed rather than the media, and it means the simulator cannot serve as a
rung 0 acceptance surface. The simulator result is not comparable head-to-head with
physical Android and is not the required iPhone baseline. Physical iOS, throttled-network,
lesson, catalog-asset, merge-rate and Pixel measurements remain open.

- ~~Run tier A: catalog `ffprobe` statistics (A1) and the `skippedMergeReason` rate (A2).~~
  **A1 done 2026-09-24** — [results](video-playback-catalog-assets-2026-09-24.md); it answers
  decision 4 and keeps Phase 3, with different content than expected: not compatibility, but
  `+faststart`, the GOP and the frame rate. **A2 is unmeasured** and stays open (n=5).
- Run tier B on the fixed scenario: baseline recordings on physical iOS and Android, Wi-Fi and
  throttled cellular. Include the `surfaceView`/`textureView` comparison on the feed.
  **Available hardware (2026-09-24): one physical iPhone and one physical non-Pixel Android, plus
  simulators and emulators.** That covers every row of the tier B table except one.
- **The Pixel 9/10 refresh-rate check cannot run — no such device is available.** Record it as
  *unverified*, never as passed. It is one of the three triggers for reopening the SDK upgrade in
  option 0, so leaving it unmeasured keeps that trigger permanently untested rather than cleared,
  and keeps adaptive-refresh Android an open risk.
- Record the baseline for **two** surfaces even though only one will be optimised: the Stepz feed
  and `learn-dance-screen`. The second costs about twenty minutes in the same session and is the
  only protection against optimising the wrong screen.
- Option 0 is already answered (stay on SDK 55), so it no longer blocks anything.
- **Read the baseline correctly.** It is not a cold-start number. The feed already prefetches both
  neighbours, so the swipe-latency headroom a pool can recover is smaller than the
  reference implementations' figures imply, and part of what the ladder buys is bytes rather than
  milliseconds. Record transferred bytes per swipe alongside time to first frame, or rung 1's main
  win is invisible in the numbers.

### Phase 0b — the fixes that do not need a measurement — **done 2026-09-24**

Both had a known cause, a known blast radius and a user-visible symptom. Neither waited on the
pilot, and neither is large enough to confound it.

- **Set `audioMixingMode` on every player**, not on the two unmuted ones — see the corrected
  section above. `packages/mobile-kit/src/media/audio-mixing.ts` owns the two modes;
  `keepBackgroundAudio` goes on the eleven muted players across both apps and `dance-flow`, and
  `takeOverBackgroundAudio` on `dance-post-detail-screen.tsx` and `personal-video-section.tsx`.
  Covered by a unit test on the module plus screen assertions in the feed and the post detail,
  each starting its fake player on the native `doNotMix` so an inherited mode fails the test.
- **Bumped `expo` 55.0.28 → 55.0.31.** A patch move inside the same SDK line. It carried the
  usual transitive `@expo/*` tooling churn (`@expo/cli` 55.0.34 → 55.0.36, `@expo/metro-config`
  55.0.25 → 55.0.27, `expo-asset` 55.0.18 → 55.0.20); `expo-video` stays at 55.0.21 with the
  repo patch applied. Doing it before the pilot means the baseline and the ladder are measured
  on the same bytes.

Neither is verified on a device yet — the audio-session behaviour is an iOS runtime effect, so
it needs one pass on the physical iPhone with music playing, folded into the Phase 0 tier B
session rather than run on its own.

### Phase 1 — the feed-first pilot

**Scope: the Stepz feed only** — `apps/edu/src/features/feed/ui/feed-screen.tsx` and
`feed-move-page.tsx`. No server change, nothing in `apps/mobile`, no SDK upgrade, no telemetry.

The feed is the right pilot for reasons other than its size: its sources are **public, stable
URLs**, so it is the one surface where every caching mechanism works without the signed-URL fix;
and its metrics — swipe to first frame, and bytes moved per swipe — are unambiguous and
measurable from a screen recording and a netstats delta, with no telemetry.

**Qualified 2026-09-24** ([tier A](video-playback-catalog-assets-2026-09-24.md)). Two things
the pilot has to account for:

- the two Phase 0 baselines were recorded against the **pre-migration Boogiz copies**, which had
  no CDN in front of them. The rows were repointed on 2026-09-24
  (`scripts/repoint-dance-media.mjs`). **Both were re-measured the same day** — the
  [Android device run](video-playback-android-baseline-repointed-2026-09-24.md), which is the one
  to judge the rungs against, and the
  [simulator diagnostic](video-playback-ios-simulator-baseline-repointed-2026-09-24.md), which now
  shows no empty media at all while paging. The iPhone pass has still never been run, so there is
  no measurement on real iOS hardware at all;
- the feed's own source, `mainVideoUrl`, was **0 % faststart** when those baselines were taken.
  All 808 published `main` objects were remuxed on 2026-09-24, so the re-measured baseline
  already carries that improvement and no rung should be credited with it. Measured: the remux
  and the CDN together cut visible blank video per transition from 0.91 s to 0.57 s and raised
  bytes per transition by about half, because nothing bounds the buffers that now fill faster.

Climb the ladder one rung at a time and re-measure after each. **Stop at the first rung that hits
the target**; the rungs above it are then not worth their cost.

**Rung 0 — a poster behind the first frame (about an hour).** `feed-move-page.tsx:31-40` renders
the `Image` only when the video is missing or has failed, so a swipe onto a page whose first frame
has not decoded shows the app background. `resolvePreviewMedia(move)` already returns both
`videoUrl` and `imageUrl`. What the user perceives is the first *frame*, not the first *video* —
this alone may clear the bar.

Copy the shape the repo already uses rather than inventing one: `dance-post-detail-screen.tsx:38-42`
renders the poster as an **overlay dismissed on the first decoded frame** (`hasFirstFrame`), with
the comment explaining why — `VideoView` has no poster prop. Prefer that to laying the poster
*beneath* the video. Beneath depends on the video surface being transparent before the first frame,
which holds for `textureView` and `AVPlayerLayer` but not for a `surfaceView` hole-punch — and
whether the feed keeps `textureView` is still open (decision 10). The overlay survives that
decision either way.

**Rung 1 — bound the prefetch that already exists (about an hour).** The feed's two
neighbours prepare at construction and buffer with no ceiling: Android's default
`preferredForwardBufferDuration` is 20 s, and nothing in the repo sets `bufferOptions` at all.
Since `bufferOptions` is a settable property on a live player, this is one effect inside
`FeedMoveVideo`:

- inactive page: a small `preferredForwardBufferDuration` (2–3 s) and, on Android, a
  `maxBufferBytes` around 1.5–2 MB — the "first chunk only" behaviour, expressed in the one knob
  each platform gives us;
- active page: the defaults.

No pool, no new module, no policy function. Expect it to cut per-swipe bytes sharply while leaving
swipe latency roughly where it is — which is exactly why the baseline has to record bytes as well
as milliseconds. This is the rung the first five passes never had, because they believed the
neighbours were cold.

**Rung 2 — turn the remaining knobs (about half a day).** No architectural change:

- `useCaching: true` on the feed source — public and stable, exactly the case option 3 calls
  for. Once the rows are repointed, a device-cache miss falls through to a Cloudflare edge that
  does cache these objects. It means passing a `VideoSourceObject` where a string is passed today; an inline literal is
  safe because `useVideoPlayer` keys on `JSON.stringify(parsedSource)`, but the same literal would
  be a new-player-per-render bug under `createVideoPlayer` in rung 3;
- `setVideoCacheSizeAsync(200–500 MB)` at startup, before any player exists;
- lower `bufferOptions.minBufferForPlayback` on Android (default 2 s) — the one knob that moves
  Android TTFF with no preloading at all. It is ignored when `preferredForwardBufferDuration` is
  lower, so set it together with rung 1's neighbour bound rather than independently of it.

**Do not lower `windowSize` here.** "3 → 2, since mounted neighbours buffer nothing" is the
tempting cleanup and it is wrong: they do buffer, so dropping the window deletes the lookahead the
pilot is trying to create. `windowSize` moves only in the commit that makes a detached player
responsible for the next page — that is rung 3.

Note the SDK 55 caveat: `useCaching` enters the two iOS crash paths verified above. Acceptable on a
dev build being measured; a shipping decision needs the bounded budget and a conscious choice.

**Rung 3 — the pool and deliberate preloading (about a week).** Only if rungs 0–2 miss. Build it in
`packages/mobile-kit/src/media/` from the first line, because that is the part which transfers.
Detached-player preload of the next page, a pure and unit-tested backpressure policy, the
replace-before-release invariant as an explicit tested property of the pool module — and only now,
`windowSize` down to 2, since the pool rather than the mount is what keeps the next page warm.

State what rung 3 buys over rung 1 precisely, because constructor prepare narrows it: not
lookahead (rung 1 has that), but **asymmetry** (1 behind / 3–5 ahead instead of ±1), **reuse**
(a decoder count fixed by the pool rather than by list behaviour), and **back-pressure** (stop
speculating on a fling or a thin active buffer). Judge it against those three, not against a cold
start.

#### The stopping rule, made operable

"Stop at the first rung that hits the target" needs a target per rung. Measure each on the fixed
tier B scenario, both platforms, Wi-Fi and throttled cellular:

| Rung | Passes if |
| --- | --- |
| 0 | swipe → *something rendered* under 100 ms, and swipe → first video frame no worse than baseline |
| 1 | bytes transferred per swipe down by more than half, with swipe → first frame no worse than baseline |
| 2 | median swipe → first frame under 150 ms Wi-Fi / 300 ms cellular on a back-swipe (cache hit) |
| 3 | the same on a forward swipe to a never-seen page, with no regression in scroll jank |

#### What the pilot does and does not license elsewhere

| Produced by the pilot | Reusable on other surfaces? |
| --- | --- |
| The pool module in `packages/mobile-kit/src/media/` | yes — catalog cards, history grid, lesson pager |
| The measurement protocol and fixed scenario | yes, everywhere |
| Decoder-count discipline | yes |
| `setVideoCacheSizeAsync` budget at startup | yes, app-wide |
| The `useCaching` strategy | **no** — it works on the feed's public URLs and is useless against rotating signed UGC URLs, where the mechanism is 4D |
| The preload-next-page policy | **no** — only surfaces with a "next item" have one |
| The conclusion "this was worth it" | **no** — the feed is won on *first* play, the practice surfaces on *replay* |

So the pilot transfers code, not verdicts. Treat a good feed result as evidence the pool is worth
building, never as evidence the practice surfaces are solved.

### Phase 1b — the rest of Phase 1, sequenced after the pilot

**Decision 1 is answered: both, split by surface (2026-09-24).** The feed is a first-play
surface and the lesson, pro-tip, record and replay surfaces are repeat-play surfaces, so Phase 1b
is no longer a bet on one reading of the product — it is the **practice-surface track**, and it
runs alongside the feed pilot instead of behind a product answer. Two consequences: nothing here
waits on Phase 1's numbers, and when scope has to be cut the cut is made *per surface*, with an
explicit call about which surface loses, rather than by dropping a phase.

The local file cache (4D) remains this track's largest lever, but it is **gated on decision 7,
which the product owner has deferred**. Until that is answered the track ships its cheaper items
and leaves the cache unbuilt.

Otherwise unchanged in content, deliberately deferred in time:

- Poster-first recorded-dance grid; no `VideoView` fallback for a missing poster.
- One active catalog player; thumbnails for inactive `DanceMoveCard`s.
- Stable-key local file cache (option 4D) for lesson and reference clips, with an LRU budget and
  a sign-out purge; play the local URI when it exists and stream otherwise. **On SDK 55 this ships
  before `useCaching` reaches any practice surface, not after.**
- Client-side `generateThumbnailsAsync` poster at record time, so no grid cell ever falls back
  to a live `VideoView`.
- Assert H.264 at capture. (`audioMixingMode` moved to *Phase 0b*: it is a shipping iOS bug on two
  named files, not a hygiene item that should wait for the pilot.)
- Prefetch on intent (option 9): start the fetch when the move card is tapped, not when the player
  mounts — cancellable.
- Carry the SDK 55 workarounds explicitly: replace-before-release (ours on every version),
  a poster cover over every Android `replaceAsync`, and remount-on-error.
- Tests for active/inactive mounting, cache-source selection, the preload policy, and the
  pool's replace-before-release invariant.

### Phase 2 — delivery

- Server-side signed-URL memoization (option 4A), stored on the row rather than in process
  memory if the server runs more than one replica, plus a signed-URL TTL audit that accounts for
  the edge cache outliving the token.
- ~~Repoint the `dance_moves` and `music_tracks` URL columns at the `dance-media` objects.~~
  **Done 2026-09-24** — `scripts/repoint-dance-media.mjs`, 6,926 fields, no app change. The
  objects were already correct (`max-age=31536000`, served `HIT`); only the rows were stale.
  **`import-boogiz-dancemoves.mjs` upserts every column from the Mongo backup, so re-running the
  catalog import restores the legacy URLs** — that is how they went stale after
  `migrate-dance-media.mjs` had repointed them. Either keep the URL columns out of that upsert,
  or re-run the repoint script after every import.
- Define the logout/cache-clear lifecycle before any UGC is cached.

### Phase 3 — encode; the data warrants it, but not for the reason assumed

Tier A kept this phase and changed its content. The corpus is uniformly H.264 High / yuv420p at
a sane resolution and bitrate, so the *compatibility* motivation is gone. Three ingest-side
defects replace it, and the first is large enough that it should not wait for Phase 3 at all:

- ~~**`+faststart` remux — promote this to run beside rung 0.**~~ **Done 2026-09-24 for the feed**
  (`scripts/remux-faststart.mjs`): 808/808 published `main` objects now carry `moov` before `mdat`,
  confirmed at the edge. 784 were remuxed in the first pass, 4 more after the script learned to
  drop a `tmcd` timecode track, 20 in an earlier trial run. Two things this left open: the other
  video roles are still tail-`moov` (`--field all` covers them, ~3,000 objects, do it before the
  Phase 1b practice work), and new uploads still land tail-`moov` — see the next item.
- **New admin video uploads land tail-`moov`, so the corpus drifts back.** Not a quick fix, and
  the reason is architectural: `createUploadTicket`
  (`apps/server/src/modules/admin/dance-media-service.ts`) only mints a signed upload URL, and
  `media-upload-input.tsx` then sends the bytes **browser → storage directly**. The server never
  holds a video, so it has nowhere to run ffmpeg. Images do not have this problem — `uploadImage`
  streams through Fastify and sharp already rewrites them. The dependency is not the obstacle: the
  server already ships `ffmpeg-static` and `@ffprobe-installer/ffprobe` for the scan worker.
  The fix is a post-upload step — the admin calls a new endpoint with the object path once
  `uploadToSignedUrl` resolves, and the server downloads, remuxes and overwrites, reusing the
  logic in `scripts/remux-faststart.mjs` (including `-map -0:d` and the origin read, both of which
  that script had to learn). It must fail soft: the upload has already succeeded by then.
  **Until that exists, re-run `scripts/remux-faststart.mjs` after a batch of catalog uploads** —
  it is idempotent and skips everything already faststart, so the cost is one head request per
  object. This is the second recurring chore on this corpus, beside re-running
  `scripts/repoint-dance-media.mjs` after every catalog import.
- **A 1 s GOP for the practice assets.** The measured median is 4.167 s (`-g 250` at 60 fps),
  p90 8.333 s. This one is a real re-encode, so it is Phase 3 proper and it applies to the lesson,
  pro-tip and presentation roles rather than the whole corpus.
- **Decide what to do about 60 fps.** 87 % of the corpus is 60 fps; the feed holds three prepared
  decoders. Measure before re-encoding — a 30 fps rendition halves decode work but is a visible
  change to the product, not just a delivery change.
- Ingest normalisation/transcode for admin-uploaded catalog media and for the media
  worker's merge output (replace `-c:v copy` with a bounded encode when the source exceeds
  the target ceiling).
- Optional second rendition + network-aware selection.
- Resumable/background uploads for larger recordings.
- Retain `+faststart` and a 1 s keyframe interval on every progressive MP4 output.

Separately, and not a playback item: **210 published moves (26 %) have no pro-dancer video** —
their Boogiz source 403s, so the migration could not copy it, and `learn-dance-screen.tsx:173`
plays the dead URL today. Re-uploading those is a content repair with its own owner.

**Explicitly deferred:** HLS/ABR and the localhost-proxy cache. Revisit only if long-form
lessons ship or measurement shows ABR beating an optimised progressive MP4 on our clips.

## Decisions needed

1. ~~Is the primary promise smooth *first* play on weak networks, or instant *repeat* play of
   short clips?~~ **Answered 2026-09-24: both, split by surface.** The feed is a first-play
   surface; the lesson, pro-tip, record and replay surfaces are repeat-play surfaces. This
   ratifies what the pilot analysis already concluded in *What the pilot does and does not license
   elsewhere* — the pilot transfers code, not verdicts — and it converts Phase 1b from a gated bet
   into a parallel track. It also means neither track may be silently dropped to fund the other:
   cutting scope now requires naming the surface that loses.
2. ~~Are published lesson/reference assets allowed to stay public, immutable CDN assets?~~
   **Answered 2026-09-24, with one follow-up that is work rather than a decision.** They are
   public, immutable (`max-age=31536000`) and served `HIT` by Supabase's Cloudflare layer, which
   is intentional and already correct. The follow-up — repointing the rows at those objects — was
   done the same day; what is left is keeping the catalog import from undoing it. See Phase 2.
3. May private recordings remain in the device media cache after logout, or must it be
   cleared?
4. ~~What are the real duration, resolution, codec and bitrate distributions of current
   catalog videos?~~ **Answered 2026-09-24** —
   [tier A](video-playback-catalog-assets-2026-09-24.md). Uniform H.264 High / yuv420p, 720×1280
   dominant, median 9.6 s at 1.20 Mbps. The distributions are healthy; what is not is
   `+faststart` (1.7 %), the frame rate (87 % at 60 fps) and the keyframe interval (median
   4.167 s).
5. Is operating an ingest transcode step acceptable (we already run FFmpeg), or should a
   managed provider be evaluated — and separately, is Mux-style playback QoE analytics
   worth buying rather than building?
6. Architecture A, B or C (see *Candidate architectures*)? **No longer a decision to take up
   front.** The feed-first pilot decides it by measurement: any of rungs 0–2 landing on target
   *is* B, and rung 3 *is* A. C stays an escape hatch gated on the pilot's numbers.
7. **[OPEN — deferred by the product owner, 2026-09-24. Gates the 4D line in Phase 1b and
   nothing else.]** May lesson and reference clips be **downloaded** to the device on first open
   (option 4D), and what disk budget is acceptable? This is the single biggest lever for the
   practice surfaces and the one every comparable dance app takes. Until it is answered the
   practice track ships its cheaper items — poster-first grid, record-time thumbnails, prefetch on
   intent — and leaves the local cache unbuilt. Decisions 3 and 11 collapse into this one: a
   sign-out purge policy and the invisible-cache-versus-visible-feature question only exist if the
   answer is yes.
8. Are **mirror mode** and **multi-angle** on the roadmap? Mirror changes the Android surface
   type; a second angle changes the ingest pipeline. Both are cheaper to plan for now than to
   retrofit.
9. ~~Do we upgrade `expo-video` / the Expo SDK before building the pool (option 0)?~~
   **Answered: no.** SDK 57 contains none of the fixes this plan depends on — they are
   all in 58, which is `next` on React Native 0.88.0-rc.1 — and choosing 4D over `useCaching`
   retires the crash risk rather than deferring it. Reopen only on the three triggers listed in
   option 0.
10. Is the feed's `textureView` worth its cost, or should the transition be covered another way?
    This is a measurement question, and the Pixel refresh-rate check has to run regardless.
11. Should saved practice videos be an **invisible cache or a visible feature** ("Saved for
    practice", with a cap, a storage figure and a delete)? The implementation is the same; the
    difference is product surface, and the visible version is what the category ships.

## How this document was produced

Written over two days as six review rounds, each checking the previous one against a different
source of truth: the codebase, then the installed `expo-video` JavaScript, then the external
survey and the practice-app category, then *upstream* (changelog, PR diffs, npm dist-tags), then
the npm registry and the installed **native** source, then the working tree once more. The passes
are collapsed here because only the conclusions matter — but three of them overturned an earlier
conclusion rather than extending it, which is worth remembering before treating any statement in
a video plan as settled:

- reading the changelog instead of the installed source produced a wrong upgrade recommendation
  (the fixes were in 58, not 57);
- reading the Expo *documentation* instead of the Swift produced a wrong `audioMixingMode`
  default;
- reasoning about the hook instead of the native constructor produced a wrong model of what the
  feed already does, which had put a de-optimisation in the roadmap.

The general lesson: for this library, verify against `node_modules/expo-video/{ios,android,build}`
and the working tree, not against docs or changelogs.

## External references

### Platform documentation
- [Expo Video: caching, preloading, buffer options](https://docs.expo.dev/versions/latest/sdk/video/)
- [Supabase Storage CDN fundamentals](https://supabase.com/docs/guides/storage/cdn/fundamentals)
- [Supabase Smart CDN and signed-URL cache-key behaviour](https://supabase.com/docs/guides/storage/cdn/smart-cdn)
- [Apple HLS authoring specification](https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices/)
- [Android Media3/ExoPlayer network stacks](https://developer.android.com/media/media3/exoplayer/network-stacks)
- [androidx/media#1880 — safe number of concurrent ExoPlayer instances](https://github.com/androidx/media/issues/1880)
- [Android Media3 — use a preload manager for faster response](https://developer.android.com/media/media3/exoplayer/preloading-media/preloadmanager)
- [Android Developers Blog — a deep dive into Media3's PreloadManager (part 2)](https://android-developers.googleblog.com/2025/09/a-deep-dive-into-media3-preloadmanager.html)
- [`MediaCodecInfo.CodecCapabilities.getMaxSupportedInstances()`](https://developer.android.com/reference/android/media/MediaCodecInfo.CodecCapabilities#getMaxSupportedInstances())
- [Supabase discussion #37470 — signed URLs and CDN caching](https://github.com/orgs/supabase/discussions/37470)
- [Supabase discussion #39391 — does `createSignedUrl()` count toward cached egress?](https://github.com/orgs/supabase/discussions/39391)
- [expo-file-system `File.downloadFileAsync`](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [Android — SurfaceView vs TextureView for media](https://developer.android.com/media/media3/ui/surface)
- [Akamai — ExoPlayer's buffering strategy and startup time](https://www.akamai.com/blog/performance/enhancing-video-streaming-quality-for-exoplayer-part-2-exoplayers-buffering-strategy-how-to-lower)
- [expo-video CHANGELOG — the 56/57/58 entries this plan depends on](https://github.com/expo/expo/blob/main/packages/expo-video/CHANGELOG.md)
- [Expo SDK 57 changelog (React Native 0.86)](https://expo.dev/changelog/sdk-57)
- [`expo-video` on npm — dist-tags and release dates (`latest` 57.0.4, `next` 58.0.3, the 55 line frozen since 55.0.11)](https://www.npmjs.com/package/expo-video?activeTab=versions)
- [`expo` on npm — `latest` 57.0.24, `next` 58.0.0-preview.6](https://www.npmjs.com/package/expo?activeTab=versions)
- [`expo@57.0.24` bundledNativeModules.json — the exact upgrade cost per package](https://unpkg.com/expo@57.0.24/bundledNativeModules.json)
- [expo/expo#46495 — `useVideoPlayer` uses `replaceAsync` instead of re-creating the player](https://github.com/expo/expo/pull/46495)
- [expo/expo#49286 — iOS video cache: data race on the open-file registry](https://github.com/expo/expo/pull/49286)
- [expo/expo#49284 — iOS video cache: crash when the device runs out of storage](https://github.com/expo/expo/pull/49284)
- [expo/expo#45995 — caching takes auth headers into account](https://github.com/expo/expo/pull/45995)
- [expo/expo#47873 — Android `videoChangeFrameRateStrategy` (30 Hz UI cap on Pixel 9/10)](https://github.com/expo/expo/pull/47873)
- [expo/expo#44467 — Android hides the surface until the first frame after a source replace](https://github.com/expo/expo/pull/44467)
- [expo/expo#44935 — iOS `VideoAssetTransportProvider` (custom asset loading)](https://github.com/expo/expo/pull/44935)
- [expo/expo#47363 — iOS `audioMixingMode` default was `doNotMix`, not `auto`](https://github.com/expo/expo/issues/47363)
- [expo/expo#50481 — cached HLS can't play offline when ABR picks an uncached rendition (the open issue; #50476 is its closed duplicate)](https://github.com/expo/expo/issues/50481)
- [expo/expo#50543 — iOS: allow apps to defer background download completion](https://github.com/expo/expo/pull/50543)
- [supabase/storage — `signObjectUrl` and `signJWT().setIssuedAt()`](https://github.com/supabase/storage/blob/master/src/storage/object.ts)
- [obé Fitness — offline mode, capped at 30 saved classes](https://obefitness.com/blog/offline-mode)
- [Apple Fitness+ — downloading workouts for offline viewing](https://www.macrumors.com/how-to/download-apple-fitness-plus-offline/)
- [MasterClass — downloading classes for offline viewing](https://www.masterclass.com/help-center/masterclass/answers/downloading-classes-for-offline-viewing--id--c1GMEnNOQqiRDFdE0oa_pA)
- [Fora Soft — offline download and playback for streaming apps (Media3 DownloadManager, AVAssetDownloadTask)](https://www.forasoft.com/learn/ott/articles-ott/offline-download-playback)
- [How Instagram delivers a Reel — prefetch of the first chunk only](https://medium.com/@theshardedgate/how-instagram-actually-delivers-a-reel-to-your-feed-a-deep-dive-into-its-video-ranking-361aefc7b3f6)
- [FlashList vs FlatList vs LegendList (2026)](https://www.pkgpulse.com/guides/flashlist-vs-flatlist-vs-legendlist-react-native-lists-2026)

### Comparable implementations
- [Mux — An extra-sloppy TikTok-style video feed in React Native](https://www.mux.com/blog/slop-social)
- [The Widlarz Group — React Native Video Feed](https://sdk.thewidlarzgroup.com/video-feed)
- [expo-infinite-media — pooled players, predictive preloading, bounded caching](https://github.com/rbayuokt/expo-infinite-media)
- [GeekyAnts — Performant vertical feed in Expo: HLS caching on iOS](https://geekyants.com/blog/performant-vertical-feed-in-expo-hls-caching-on-ios)
- [expo-video-cache — localhost proxy for iOS HLS caching](https://github.com/Monisankarnath/expo-video-cache)
- [expo/expo#37850 — `useCaching: true` source not displaying](https://github.com/expo/expo/issues/37850)
- [expo/expo#43957 — `useCaching` fails on chunked responses without Content-Length](https://github.com/expo/expo/issues/43957)
- [expo/expo#49981 — wait for `replace` to finish before releasing the player (two JS lines *inside* `useVideoPlayer`; a `createVideoPlayer` pool is unaffected on every version)](https://github.com/expo/expo/pull/49981/files)
- [Efficient video caching in Expo apps with pre-signed URLs (hash the path, not the URL)](https://medium.com/@anshulkahar2211/efficient-video-caching-in-expo-apps-with-pre-signed-urls-b5ab7f08e190)
- [STEEZY Studio — looping, speed, mirror, sections](https://www.steezy.co/posts/11-things-you-can-do-with-steezy-studio-that-you-cant-do-in-a-regular-class)
- [Dance.io — Mirror & Loop & Slow](https://apps.apple.com/us/app/dance-io-mirror-loop-slow/id6748628387)
- [APL: adaptive preloading of short video with Lyapunov optimization](https://www.icst.pku.edu.cn/NetVideo/docs/20220826143529921247.pdf)
- [DRL-based preload algorithm for short video streaming (ACM MM '22)](https://dl.acm.org/doi/10.1145/3503161.3551573)
- [DeLoad — demand-driven short-video preloading with watch-time estimation](https://arxiv.org/pdf/2510.18459)
- [Bandwidth-efficient multi-video prefetching for short video streaming](https://arxiv.org/pdf/2206.09839)
- [react-native-video v7 — still a beta line; v6.19.x is stable](https://www.npmjs.com/package/react-native-video)
- [TheWidlarzGroup/react-native-video-feed — MIT Expo reference feed on RN-Video v7](https://github.com/TheWidlarzGroup/react-native-video-feed)
- [React Native Video v7 docs — player entity, `replaceSourceAsync`, `preload()`](https://docs.thewidlarzgroup.com/react-native-video/docs/v7/fundamentals/intro/)
- [Meta Engineering — bringing AV1 to Reels (decoder startup latency)](https://engineering.fb.com/2023/02/21/video-engineering/av1-codec-facebook-instagram-reels/)
- [FastPix — strategies to optimize short-video app performance](https://fastpix.com/blog/strategies-to-optimize-performance-of-short-video-apps)
- [Network-aware prefetching for short-form video streaming (arXiv 2209.02927)](https://arxiv.org/pdf/2209.02927)

### Encoding and delivery
- [Mux — Video encoding for streaming: codecs, bitrate ladders, pipelines](https://www.mux.com/articles/video-encoding-for-streaming-developers-guide)
- [Cloudinary — Best format for short-form videos](https://cloudinary.com/guides/video-formats/best-format-for-short-form-videos)
- [OTTVerse — Creating the perfect encoding ladder](https://ottverse.com/creating-the-perfect-encoding-ladder/)
- [Cloudflare Stream — securing your stream (signed tokens, MP4 downloads)](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/)
- [Mux vs Cloudflare Stream vs Bunny Stream (2026)](https://www.pkgpulse.com/guides/mux-vs-cloudflare-stream-vs-bunny-stream-video-cdn-2026)
- [Bunny Stream review: pricing, limits, alternatives (2026)](https://swarmify.com/blog/bunny-stream-review/)
