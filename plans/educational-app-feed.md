# Stepz — F1: The Feed

Status: **implemented, device pass outstanding.** Written 2026-09-17 against `615c0c7` and revised the same day
after a review pass over the working tree. Every file and line reference below was checked;
§1.2, §2.3, §3, §4.1, §4.2, §4.5, §5, §7 and §8 carry that pass's corrections. A second pass
the same day added §1.1's icon note, §2.2's `onBack` guard, §4.1's audio decision, §4.2 and §7's
catalog-order check, §4.3's profile seam, and §5's arbitration spike.

**Built on 2026-09-17.** Everything in §2 to §6 is in the tree and §8's commands are
green: 51 tests in `@bnewapp/edu`, 68 in `@bnewapp/dance-flow`, 37 in `@bnewapp/dance-core`,
112 in `@bnewapp/mobile`, both typechecks and lint. **§7's device checklist has not been run**,
so §5's arbitration is still the candidate mechanism: `.blocksExternalGesture(pagerRef)` is
what shipped, with the pager's `scrollEnabled` also tied to the drag, and neither has been
watched on hardware. Record the device, the OS and which mechanism held before calling F1
done.

**This file is the whole plan and it stands alone.** Requirement source is
`01-feed-and-dance-entry.md` in `D:\works\magnus\b-new-app\docs\educational`, read through the
decisions in §0. Where this plan and that document disagree, §2 says so and why.

**Prerequisites: none left.** S1 shipped the `level` filter (`6f29c05`), D1 shipped the local
collection (`d481648`), and §8's questions 4 and 5 are settled. This is the largest UI phase in
the programme and the first one that needs a device.

---

## 0. What is decided before a line is written

These are settled elsewhere and are **not** to be re-opened inside the implementation.

| Topic | Decision | Source |
|---|---|---|
| Video field | `mainVideoUrl ?? proDancerVideoUrl ?? presentationVideoUrl ?? filmYourselfVideoUrl` — `apps/mobile`'s shipped chain, verbatim | `features.md` §3.8 |
| Poster image | `thumbnailUrl ?? proDancerImageUrl ?? dancerTipImageUrl`, **which can still be null** | `features.md` §3.8 |
| Level options | Hardcoded `[1, 2, 3]` plus All Levels. No enumeration endpoint exists | `features.md` §3.6 |
| Style options | From `GET /api/dance/genres`, **in the server's order**. Do not hardcode the list | §4.2 below |
| Feed order | Deterministic `(sort_order, created_at, id)`. Document 01's "mixed order" is decision 6 and is not built | `features.md` §3.7, §8 |
| Likes | **Not built.** Decision 3 drops them from v1; F4 is unscheduled | `features.md` §3.2, §8 |
| Upload disclosure | **None ships.** No string may state or imply the clip stays on the device | `features.md` §3.3 |

**Two acceptance criteria in document 01 §5 will therefore not be met, by decision rather than
by omission.** Line 121 ("Like state can be switched, the total count is visible…") is dropped
with likes. Line 125 ("Permission and privacy text match the app's actual data handling") is met
only for the *permission* half: the mandated pre-prompt body says the camera scans movement to
calculate a score, which is true and silent on the upload, so it clears §3.3's negative rule.
There is no privacy half to match. Say this in the phase's report rather than quietly ticking
the boxes.

---

## 1. What already exists

```text
apps/edu/src/app/index.tsx                     # route -> FeedScreen, passes onOpenProfile
apps/edu/src/app/_layout.tsx                   # Stack, anonymous-session gate, no auth group needed
apps/edu/src/features/feed/index.ts            # exports FeedScreen
apps/edu/src/features/feed/ui/feed-screen.tsx  # PlaceholderScreen — this phase replaces it
```

- **Session**: `AnonymousSessionProvider` wraps the tree and nothing renders until an identity
  exists (`_layout.tsx:28-41`), so feed atoms may assume auth is present.
- **Transport**: `getDanceMoves` / `getDanceGenres` (`packages/dance-flow/src/api.ts:25,32`),
  reached through `@bnewapp/dance-flow/api`.
- **Query seam**: `readQueryAuth` / `requireAuth` from `@bnewapp/mobile-kit`, and `QueryProvider`
  already mounted.
- **Playback**: `useFocusedPlayback` (`@bnewapp/mobile-kit/media/use-focused-playback`) pauses a
  player when its route loses focus. It takes `(player, shouldPlay)`.
- **UI primitives**: `BouncablePress`, `DanceSkeleton`, `MobileQueryErrorBoundary`
  (`@bnewapp/mobile-kit/ui`).
- **The canonical infinite-query shape** is
  `apps/mobile/src/features/dance/_atoms/queries.ts:39-59`. Copy its structure.

### 1.1 One dependency is missing, and the filter sheets must not add a second

Document 01 line 65 forbids permanent solid boxes over the video and asks for a light gradient
behind text. `expo-linear-gradient` is in `apps/mobile` at `~55.0.18` and **not in
`apps/edu`**. Add it at that **identical range** — `apps/edu/AGENTS.md:64-71` makes a version
drift a hoisting defect, not a preference.

**It is also the only dependency this phase adds.** §4.2's two filter sheets are built from
React Native's own `Modal`, which is how every sheet in this repository already works —
`apps/mobile/src/features/dance/ui/dance-post-menu.tsx:6` and
`apps/mobile/src/features/studio/ui/item-picker.tsx`. Do **not** reach for
`@gorhom/bottom-sheet` or any other sheet library: none is installed, and one added here would
be a Stepz-only dependency on gesture-handler and Reanimated internals that `apps/mobile` does
not share — the exact drift `apps/edu/AGENTS.md:64-71` forbids. "Bottom sheet" in document 01
line 29 is a recommended presentation, not a named library.

**Icons are the third thing that looks like a dependency and is not.** `apps/edu` renders no
icon anywhere today — `src/components/` holds only `placeholder-screen.tsx` — and §4.3's
right-hand action column needs them. Use `@expo/vector-icons` exactly as `apps/mobile` does
(`apps/mobile/src/features/dance/ui/dance-post-menu.tsx:3`): it ships inside `expo` and is
declared in **no** `package.json` in this repository, so importing it installs nothing and
leaves nothing to keep version-aligned. Do not add an icon library for this.

### 1.2 Gesture handling is mounted nowhere in this repository

`react-native-gesture-handler` is a dependency of both apps at `~2.30.1` and **is imported by
neither.** `GestureHandlerRootView` appears in no source file, and nothing renders it on our
behalf: `@react-navigation/{core,native,native-stack,elements,bottom-tabs}` and `expo-router`
contain no reference to it either. F1's tempo bar is therefore the **first gesture consumer in
the monorepo**, and §5 cannot be written on the assumption that RNGH already works here.

`apps/edu/src/app/_layout.tsx` must wrap the tree in `GestureHandlerRootView`
(`style={{ flex: 1 }}`, outside `SafeAreaProvider`) before any pan is written. There is no
`apps/mobile` precedent to copy — this app is where it gets added first. Skip it and the pan
simply never activates on Android, which presents exactly like the arbitration bug §5 warns
about and will send you hunting in the wrong place.

---

## 2. Where document 01 is wrong about this codebase

The first two were found by reading the code, not the document. §2.3 is a different kind of
item: a call `features.md` explicitly left to this phase. None of the three is optional.

### 2.1 "Use the existing tempo component" — there is no such component

Document 01 line 48 says to reuse an existing tempo control. The only thing resembling one is
`PlaybackRateBar` (`apps/mobile/src/features/dance/ui/learn-dance-screen.tsx:176-202`), and it is
the wrong component in three ways: it is a **horizontal row of five discrete buttons**
(`PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5]`, `:204`), it is **private to `apps/mobile`'s dance
feature**, and it is not a drag control at all.

Document 01 lines 44-46 ask for something else entirely: a **vertical bar on the right, at least
one third of screen height, continuous update during the drag**.

**Decision: build a new control in `apps/edu`.** Do not export `PlaybackRateBar`, and do not
widen it into a drag control — `apps/mobile` ships it as buttons today and this phase has no
mandate to change that app. Keep the **same rate bounds**, 0.5× to 1.5×, so the two apps do not
disagree about what speeds a move supports.

### 2.2 The camera pre-prompt already exists, with different copy, in a shared package

Document 01 §3 mandates exact strings. `CameraPermissionOverlay`
(`packages/dance-flow/src/ui/camera-permission-overlay.tsx`) already renders a pre-prompt, and
every string differs:

| | Document 01 §3 | Shipped overlay |
|---|---|---|
| Title | Allow camera access | Camera access is needed (`:25`) |
| Body | The camera is used to scan your movement and calculate your score. | Allow camera access to record your dance attempt. Video capture never records microphone audio. (`:28-29`) |
| Primary | Allow Camera | Allow camera (`:38`) |
| Secondary | Not now | **absent** |
| Denied | Open Settings / Cancel | A sentence telling the user to go to Settings, with no link and no cancel (`:41-43`) |

The overlay is in `@bnewapp/dance-flow`, which `apps/mobile` also uses, so editing its strings in
place changes the other app's UX without a mandate.

**Decision: make the copy injectable, have Stepz pass document 01's strings, and let the
package own the two missing actions.** **Every new copy prop defaults to the string the overlay
ships today**, so `apps/mobile` passes nothing and is not edited for this at all — §9 depends on
that, and `packages/dance-flow/src/ui/__tests__/record-dance-screen.test.tsx:208,279` enforces
it (§8). Defaulting is the requirement, not one of two acceptable ways to get there. This
follows the repo's rule that a shared package takes app configuration by injection rather than
branching on which app is running.

**The seam is props on `RecordDanceScreen`, not on the overlay.** `CameraPermissionOverlay` is
**not in `@bnewapp/dance-flow`'s `exports`** — the package publishes `record-screen`,
`result-screen`, `atoms`, `api`, `config` and `dev`, and an unlisted subpath is not importable at
all. So the copy arrives as new optional props on `RecordDanceScreen`, threaded to the
overlay at its single call site
(`packages/dance-flow/src/ui/record-dance-screen.tsx:375`, which today passes only
`canRequestPermission` and `onRequest`). Stepz supplies them from
`apps/edu/src/app/move/[moveId]/scan.tsx`, and `apps/edu/src/features/scan/index.ts:6` already
re-exports the screen, so the seam needs no new package export. Do not try to reach the overlay
directly.

**The two missing *actions* are the package's own behaviour, not props.** They are worth
having in both apps and neither app should have to wire them: a **Not now** that calls the
`onBack` `RecordDanceScreen` already receives, and an **Open Settings** that calls
`Linking.openSettings()` — `react-native` core, so no new dependency — in the denied state,
which today is a dead end in both apps. Only document 01 §3's four strings are injected.
Adding them changes `apps/mobile`'s overlay from a dead end into a working one, which is a fix
rather than a copy change and needs no mandate from that app.

**Render Not now only when `onBack` is present.** The prop is `onBack?: (() => void) | undefined`
(`packages/dance-flow/src/ui/record-dance-screen.tsx:53`). Both routes pass it today
(`apps/mobile/src/app/dance/[moveId]/record.tsx:13`,
`apps/edu/src/app/move/[moveId]/scan.tsx:12`), but the type does not require it, so a button
rendered unconditionally becomes a dead control for the next consumer that omits it.

**The flow itself does not change.** Document 01 §3 describes the explanation appearing when the
user taps **Dance this Move**; the shipped flow navigates first and shows the overlay over the
camera screen. That satisfies both of §5's permission criteria — first use asks, an already
granted permission goes straight through — without inventing a second permission screen. Keep it.

### 2.3 The preview-media chain has no home yet, and `features.md` §3.8 left that call to F1

`features.md` §3.8 settled *which* fields the feed reads and deferred *where the resolution
lives*: "prefer one `resolvePreviewMedia(move)` in `packages/dance-core` — pure, DTO-only, no
React — to a second copy of both chains." Today the only copy is inline in `DanceMoveCard`
(`apps/mobile/src/features/dance/ui/dance-move-card.tsx:24-29`).

**Decision: add `resolvePreviewMedia` to `packages/dance-core` and move both call sites onto it
in this phase's commit.** Stepz's card is the second consumer, which is what makes the chain
genuinely shared rather than a premature abstraction. Leaving `DanceMoveCard` inline ships the
duplicate §3.8 asked us not to ship, and the whole point of that decision is that the two
apps cannot drift.

**It must not pull `@bnewapp/types` into `dance-core` to do it.** That package declares *no*
dependencies (`packages/dance-core/package.json`) and defines its own shapes in `src/types.ts`;
adding a package edge for one function spends that property for nothing. Type the parameter
structurally instead, keeping `filmYourselfVideoUrl` non-null so the video chain's return type
stays `string`:

```ts
export interface PreviewMediaSource {
  mainVideoUrl: string | null;
  proDancerVideoUrl: string | null;
  presentationVideoUrl: string | null;
  filmYourselfVideoUrl: string;
  thumbnailUrl: string | null;
  proDancerImageUrl: string | null;
  dancerTipImageUrl: string | null;
}

export function resolvePreviewMedia(move: PreviewMediaSource): {
  videoUrl: string;
  imageUrl: string | null;
};
```

`DanceMove` (`packages/types/src/index.ts:208-226`) satisfies that structurally, so neither app
casts. Unit-test both chains in `packages/dance-core/src/__tests__/`, including the
`imageUrl: null` branch §4.4 depends on.

**Consequence for validation:** `dance-core` is a *compiled* package, so a bare `tsc` in either
app cannot see the new export until it is built. §8 uses Turbo for both apps because of this.

---

## 3. State

New, under `apps/edu/src/features/feed/_atoms/`. Client state is plain Jotai; server state is
`jotai-tanstack-query`. Nothing here is persisted: document 01 line 22 wants a cold start at
**All Levels / All Styles**, so filters are session state and MMKV would actively break that.

```ts
// ui.ts
export const selectedLevelAtom = atom<number | null>(null);      // null = All Levels
export const selectedGenreIdAtom = atom<string | null>(null);    // null = All Styles
export const activeMoveIndexAtom = atom(0);
export const playbackRateAtom = atom(1);
export const proTipMoveIdAtom = atom<string | null>(null);       // null = overlay closed
```

```ts
// queries.ts
export const feedGenresAtom = atomWithSuspenseQuery<DanceGenre[]>(...);   // ["feed-genres", userId]
export const feedMovesAtom  = atomWithSuspenseInfiniteQuery<...>(...);    // ["feed-moves", userId, genreId, level]
```

Points that are not obvious:

- **Both filters belong to the one query key**, `["feed-moves", userId, genreId, level]`. A
  filter change is then a new cache entry, which is exactly document 01 line 43's "make any
  reload clear to the user" rather than a silent in-place mutation.
- **`getDanceMoves` does not accept `level` yet.** Its params are `genreId`, `cursor`, `limit`
  (`packages/dance-flow/src/api.ts:19-23`). The server takes `?level=` as of `6f29c05`. Add
  `level?: number | null` to `GetDanceMovesParams` and set the param when present. It is an
  optional addition to a shared package; `apps/mobile` passes nothing and is unaffected.
- **No empty-page reconciliation is needed here.** `listMoves` applies both filters in SQL before
  `limit(limit + 1)`, so `hasNextPage` is computed over already-filtered rows and an empty page
  always carries `nextCursor: null`. Use the server cursor as the next `pageParam` and stop when
  it is null. Do not add the "advance until a page yields items" loop that `CLAUDE.md` §6
  describes for feeds whose server can return an empty page with a live cursor.
- **Reset on move change**: `playbackRateAtom` returns to `1` whenever `activeMoveIndexAtom`
  changes (document 01 line 47). Do this in the screen's viewability handler, not inside the
  tempo control, so it holds for swipes as well as for Pro Tip dismissal.
- **Reset on filter change, both atoms.** A filter change is a new query key, so the list the
  index points into is replaced wholesale: `activeMoveIndexAtom` must return to `0` and
  `playbackRateAtom` to `1`. Resetting only the rate leaves a stale index: change a filter while
  sitting at index 7 and, on a shorter result set, no item satisfies `index === activeIndex`, so
  **nothing plays at all** and the screen reads as broken rather than as empty. The precedent
  solves the same problem for its own selection atom with an effect over the fetched list (`apps/mobile/src/features/dance/ui/choose-dance-moves-screen.tsx:63-66`); do
  it in the filter setter here instead, which is earlier and does not depend on a render.
- **The key holds a number.** The precedent types its key `(string | null)[]`
  (`apps/mobile/src/features/dance/_atoms/queries.ts:43`). `level` is a `number`, so widen the
  generic to `(string | number | null)[]` rather than stringifying it. `userId` stays at **index
  1** either way: `AnonymousSessionProvider` scopes its cache cancellation and removal on exactly
  that position (`apps/edu/src/lib/auth/session-provider.tsx:82`), so moving it orphans the
  outgoing identity's entries.

---

## 4. The screen

`apps/edu/src/features/feed/ui/feed-screen.tsx` replaces the placeholder. Composition is
**screen → pager → move page**, with the route file unchanged.

### 4.1 Pager

`FlatList`, `pagingEnabled`, vertical, one full-screen item per move, `keyExtractor` = `move.id`.

- `onViewableItemsChanged` with a stable `viewabilityConfig`
  (`itemVisiblePercentThreshold: 80`) sets `activeMoveIndexAtom`. Only that item's player runs,
  through `useFocusedPlayback(player, index === activeIndex)`.
- Videos **loop and play muted**, both set in the `useVideoPlayer` initializer exactly as the
  precedent does (`apps/mobile/src/features/dance/ui/dance-move-card.tsx:107-110`:
  `player.loop = true; player.muted = true`). Document 01 line 41 asks for the loop and says
  nothing about sound, and `DanceMove.music` exists, so **silence is a decision here rather than
  a default**. Keep it silent in F1: a feed that autoplays audio the moment the app opens is a
  product change, not an implementation detail. Raise it as a product question if a demo wants
  music.
- `onEndReached` → `fetchNextPage`, guarded by `hasNextPage && !isFetchingNextPage`.
- A small `windowSize`; every item holds a video player. **`removeClippedSubviews` is a
  device-verified toggle here, not a default.** The repo applies it to a *horizontal grid* of
  cards; on a full-screen `pagingEnabled` vertical list it is a well-known source of blank pages
  on Android. Start without it, measure, and add it only if `windowSize` alone is not enough,
  then re-run §7's swipe checks.
- Initial read under Suspense with `MobileQueryErrorBoundary` and a retry action. **§4.5 fixes
  where that boundary sits, and it is not where the precedent puts it.** Keep the
  pull-to-refresh and pagination spinners explicit — Suspense does not cover them.

### 4.2 Filters

Two buttons at the top, each opening a `Modal`-backed bottom sheet (§1.1 — no sheet library).
The button label reflects the selection.

- **Level**: All Levels, Level 1, Level 2, Level 3 — the hardcoded constant of §0. Put it in one
  named export in the feature so the revisit trigger in
  `plans/educational-app-level-filter.md` §3 has a single place to land.
- **Style**: All Styles plus `feedGenresAtom`, **rendered in the order the server returns**
  (`listGenres` orders by `(sort_order, id)`). Document 01 line 37 names an agreed order — Hip
  Hop, Afro, Commercial, Party, Breaking, Ballet, Shuffle, K-pop — and that order is **admin
  data, not client code**: it lives in `dance_genres.sort_order`. If the catalog's order does not
  match, fix it in the admin panel. Hardcoding the list in the client would strand any style an
  admin adds later. **Check the catalog's order once before the device pass** — no client test
  can detect a wrong `sort_order`, and a sheet listing styles out of the agreed order reads as an
  F1 bug rather than as catalog data. §7 carries that check.
- Only one level and one style may be active (document 01 §5 line 116); each may be All.
- A filter change scrolls the pager back to the top and resets **both** `activeMoveIndexAtom`
  and `playbackRateAtom` (§3). The two buttons and their sheets live *above* the Suspense
  boundary — see §4.5.

### 4.3 The rest of the furniture

| Element | Placement and rule |
|---|---|
| Move name | Bottom left, over a gradient, never a solid box (doc 01 lines 57, 65) |
| Pro Tip | Shown only when `dancerTipVideoUrl` or `dancerTipImageUrl` exists; hidden otherwise (doc 01 line 110) |
| Profile | Right-hand action column, **outside the tempo bar's touch area** (doc 01 line 56) |
| Dance this Move | Bottom, inside the safe area, highest contrast on screen (doc 01 line 58) |
| Central area | About 60% of width and 70% of height stays free of permanent controls (doc 01 lines 62-63) |
| Tempo value | Rendered **only during interaction** (doc 01 line 67) |

**Profile keeps the prop seam the route already uses.** `apps/edu/src/app/index.tsx` renders
`<FeedScreen onOpenProfile={() => router.push("/profile")} />`. The rewritten screen keeps that
prop and calls it from the action column instead of importing `router` itself — that is what lets
§4 say the route file is unchanged.

**Pro Tip was an in-screen overlay; it is now a route push. Superseded.** The original rule
here read "Pro Tip must be an in-screen overlay, not a route push", because document 01 line 55
requires that closing it restores the same feed position, filters and playback speed, and an
overlay driven by `proTipMoveIdAtom` made that restoration automatic. What the overlay could not
do is answer Android's hardware Back: it was a plain view, not a `Modal`, so Back closed the app
instead of the tip — a feed bug confirmed on a device and logged in
`plans/educational-app-scan.md` §1.3. Pro Tip is therefore
`apps/edu/src/app/move/[moveId]/pro-tip.tsx` on the stack. Line 55 still holds and is still met:
a push leaves the feed screen mounted underneath, so its position, filters and speed are never
torn down. `proTipMoveIdAtom` is gone, and with it the coupling that hid the filter bar.

### 4.4 Empty, error and loading states

- No matches → **No moves found** and **Reset filters** (doc 01 lines 35, 106). Reset returns
  both atoms to `null`.
- A video that fails to load → **Retry** on that item, **keeping the current filters** (doc 01
  line 107). Retrying re-creates the player for that item only.
- A move with neither a video nor a poster image → render the card with its title and the CTA.
  §3.8's image chain can be null and the feed must not blank out.
- `isPending` → skeleton, via `DanceSkeleton`.

### 4.5 Where the Suspense boundary sits

**The filter buttons and their sheets go *above* `MobileQueryErrorBoundary` and above
`Suspense`; only the pager goes inside.** Both filters are in the moves query key, so every
filter change re-suspends that query.

The precedent puts its filter row *inside* the boundary
(`apps/mobile/src/features/dance/ui/choose-dance-moves-screen.tsx:45-49` wraps the content and
the genre selector renders at `:156`). Copying that here breaks two of this phase's own
requirements:

- The filter row disappears into the skeleton on every change, so the user cannot correct a
  mis-tap until the fetch lands.
- A failed fetch replaces the row with the error card, and §4.4's **Retry** must keep the
  current filters (doc 01 line 107). With the filters unmounted there is nothing for it to keep,
  and **Reset filters** (line 106) is unreachable from the one failure it exists to recover from.

`CLAUDE.md` §7 states the shape of this rule for guards; filter state that the query key
depends on belongs on the same side of the boundary.

---

## 5. The tempo bar — the part that will fight you

A vertical drag control on the right edge, at least one third of screen height, continuous.

```
rate = clamp(0.5, 1.5, rateAtDragStart + (-translationY / barHeight) * (1.5 - 0.5))
```

Dragging **up** is a negative `translationY`, hence the sign. Apply to
`player.playbackRate` on every update, not on release.

**Step 0 is mounting `GestureHandlerRootView` (§1.2).** Neither `apps/edu` nor anything in
its navigation stack renders it, so until it is in the root layout every gesture below is a no-op
on Android. Do that first and confirm a bare pan fires before building the rate arithmetic on top
of it.

**The gesture conflict is the acceptance risk of this whole phase.** Document 01 line 46 and §5
line 118 both require that a drag inside the bar does not also page the feed, and line 42
requires that a vertical swipe *outside* the bar still does. Two vertical gestures overlap.

The mechanism is `react-native-gesture-handler` v2 (`~2.30.1` in both apps): give the `FlatList`
a ref and declare the pan with `.blocksExternalGesture(listRef)` so the pan wins inside its own
area while the list keeps everything else. **Verify this on a device.** Gesture arbitration is
not observable in jest, and the failure is not a crash — it is a bar that scrolls the feed, or a
feed that will not scroll near the right edge.

**Treat `.blocksExternalGesture(listRef)` as the candidate mechanism, not a settled one.** §1.2
makes this the monorepo's first RNGH consumer, so there is no working arbitration here to copy
and nothing has ever shown that this API blocks a plain React Native `FlatList` on both platforms
at this version. Step 0's spike therefore confirms two things in order: that a bare pan fires at
all, and that it actually stops the list from scrolling. If the second does not hold, the named
fallbacks are `simultaneousWithExternalGesture` with the pager's scroll disabled for the duration
of the drag, or RNGH's own `FlatList` in place of React Native's. Choose on the device and record
which one in the phase report — the next gesture consumer in this repository inherits the answer.

Keep the bar's touch area narrow and the profile control clear of it (doc 01 line 56); they are
both in the right-hand column and are the two controls most likely to steal each other's touches.

---

## 6. Camera entry

**Dance this Move** → `router.push("/move/" + move.id + "/scan")`. The route already exists and
validates its segment (`apps/edu/src/app/move/[moveId]/scan.tsx:7-8`).

Permission is handled inside `RecordDanceScreen` as today; this phase supplies document 01 §3's
strings through the `RecordDanceScreen` copy props decided in §2.2, passed from
`apps/edu/src/app/move/[moveId]/scan.tsx`. **Not now** and **Open Settings** come from the
package itself and need nothing from the route. The silhouette itself
belongs to F2 and is gated on open decision 1 (guide or gate) — **F1 ends at the navigation**.

---

## 7. Acceptance

Jest via the shared harness (`@bnewapp/mobile-kit/testing`), tests in `__tests__/` beside the
code. Device checks are named separately because jest cannot judge them.

**Automated**

- [ ] Cold start requests All Levels and All Styles: the first `getDanceMoves` call carries
      neither `level` nor `genre_id` (doc 01 §5 line 115).
- [ ] Choosing Level 2 and a style puts both in the query key and both on the request; the list
      resets to the top (lines 116-117).
- [ ] Selecting a second level replaces the first — never two active levels (line 116).
- [ ] Reset filters returns both atoms to `null` and re-requests unfiltered.
- [ ] No matches renders **No moves found** and a working **Reset filters** (line 106).
- [ ] The video field resolves through §3.8's chain via `resolvePreviewMedia` (§2.3): a
      move with only `filmYourselfVideoUrl` still plays, and one with `mainVideoUrl` prefers it.
- [ ] `resolvePreviewMedia` returns both chains, including `imageUrl: null` when all three image
      fields are null — a unit test in `packages/dance-core`, not in the app.
- [ ] A move with no video and no poster image still renders its title and the CTA.
- [ ] Pro Tip is hidden for a move with neither tip field, shown when either exists (line 110).
- [ ] Closing Pro Tip leaves `selectedLevelAtom`, `selectedGenreIdAtom`, `activeMoveIndexAtom`
      and `playbackRateAtom` untouched (line 122). Now a stack pop, not an overlay dismissal:
      §4.3. **Device box** — the unit test can only prove opening it touches none of them.
- [ ] Android hardware Back on Pro Tip returns to the feed instead of closing the app —
      the bug §4.3 records, fixed by the route. **Device box.**
- [ ] Changing the active move resets `playbackRateAtom` to 1 (line 119).
- [ ] Changing a filter resets `activeMoveIndexAtom` to 0 as well as the rate to 1, and the first
      item of the new result set is the one that plays (§3).
- [ ] The filter buttons stay mounted while the moves query is loading **and** after it fails, so
      **Retry** and **Reset filters** are both reachable from the error state (§4.5).
- [ ] A load failure renders **Retry** and retrying keeps both filters (line 107).
- [ ] **Dance this Move** navigates to `/move/<id>/scan` with the focused move's id.
- [ ] The permission overlay renders document 01 §3's four strings when Stepz supplies them.
- [ ] **Not now** calls `onBack` and the denied state offers **Open Settings** — a test in
      `packages/dance-flow`, not in either app, since §2.2 makes both package behaviour.
- [ ] Style options render in the order `getDanceGenres` returned, not a hardcoded order.

**Device — required, and not substitutable by tests**

- [ ] A drag inside the tempo bar changes speed and does **not** page the feed (line 118).
- [ ] A vertical swipe outside the bar pages the feed (line 42).
- [ ] The profile control is reachable without triggering the tempo bar (line 56).
- [ ] The central ~60% × 70% stays clear of permanent controls, and the dancer's hands, feet and
      body line stay visible on the smallest supported screen (lines 62-64).
- [ ] The style sheet lists Hip Hop, Afro, Commercial, Party, Breaking, Ballet, Shuffle, K-pop
      in that order. This inspects `dance_genres.sort_order` in the catalog, not client code
      (§4.2); fix a mismatch in the admin panel rather than in the feed.
- [ ] The tempo value appears only while dragging (line 67).
- [ ] First run asks for camera permission; a second run opens the camera directly (line 124).
- [ ] Denied permission offers Open Settings and Cancel, and Cancel returns to the feed.

Report the device and OS used, as `apps/edu/AGENTS.md:96-98` requires.

---

## 8. Validation

```sh
corepack pnpm exec turbo run typecheck --filter=@bnewapp/edu     # dance-core must build first
corepack pnpm --filter @bnewapp/edu test
corepack pnpm --filter @bnewapp/dance-core test                  # resolvePreviewMedia (§2.3)
corepack pnpm --filter @bnewapp/dance-flow test                  # api.ts and the overlay change
corepack pnpm exec turbo run typecheck --filter=@bnewapp/mobile
corepack pnpm --filter @bnewapp/mobile test                      # DanceMoveCard calls the helper
corepack pnpm lint
```

Turbo rather than a bare `tsc` for both apps: §2.3 adds an export to a **compiled** package,
and `apps/edu/AGENTS.md:92-94` already records that a bare `tsc --noEmit` cannot see one.

**`apps/mobile`'s suite is not evidence about the overlay copy — do not treat it as such.**
No test in that app renders `CameraPermissionOverlay`; its only related test **mocks
`RecordDanceScreen` wholesale**
(`apps/mobile/src/app/__tests__/dance-clip-route-handoff.test.tsx:21`). The real regression guard
for §2.2 sits one layer down, in
`packages/dance-flow/src/ui/__tests__/record-dance-screen.test.tsx:208,279`, which asserts
today's shipped strings and therefore fails if the new props do not default to them. That is the
test that has to stay green. `apps/mobile` remains in the list for `DanceMoveCard`.

After adding `expo-linear-gradient`, check `corepack pnpm why expo-linear-gradient` reports one
version and `apps/edu/node_modules` holds no nested copy (`apps/edu/AGENTS.md:70-71`).

---

## 9. Not in this phase

- **Likes.** Decision 3; F4, unscheduled.
- **Shuffled feed order.** Decision 6; deterministic in v1.
- **The silhouette, scanning, scoring and the result screen.** F2, gated on decision 1.
- **The profile screens.** F3. This phase only navigates to `/profile`.
- **Any upload disclosure copy.** Decision 4 — and no string here may imply the clip stays on
  the device.
- **Widening `PlaybackRateBar` in `apps/mobile`.** §2.1 leaves that control as it ships.
  The one edit this phase does make in that app is §2.3's two-line substitution in
  `DanceMoveCard`, which changes no behaviour. The app does inherit §2.2's **Not now** and
  **Open Settings** through the shared package — a dead end becoming reachable, and the only
  intended change to `apps/mobile`'s UX in this phase. It is not otherwise in scope.
