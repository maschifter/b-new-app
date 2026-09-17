# Stepz — F3: Profile & Collection

Status: **planned, not started.** Written 2026-09-17 against `efba755`; every file and line
reference below was checked against the working tree as it stood then. F3 is the last product
phase of the Stepz programme — D1, S1, F1 and F2 are shipped, S3 (the retention backstop) is
still open and is *not* part of this plan.

Revised 2026-09-17 after a pre-build review. It found three places where the first draft
contradicted itself — the deletion order against 03 §6's Retry, a suspense atom behind a screen
that may not suspend, and a write-through with no stated mechanism — resolved in §2.6, §3, §4.1,
§4.5, §5 and §6. It also closed four gaps that were not contradictions: 03 §6's synchronization
indicator (§2.7), a move that belongs to two genres (§4.2 and §6), where the profile's derived
atoms live (§4.2), and which half of "pause on blur and on background" `useFocusedPlayback`
actually provides (§4.4 and §7). Nothing else changed, and no decision was reopened.

Revised again 2026-09-17 after a second review against the working tree. Every file and line
reference was re-checked and all of them hold; nothing in §0, §2 or §3 changed. Five gaps were
closed: the genre cache had one writer and it was the wrong screen (§4.1), the style sections had
no stated loading state although §6 asserts one (§4.4), the delete order did not say where
`fileName` is read (§4.5), 03 §7's row-approach thumbnail loading was neither built nor declined
(§2.4), and the card's accessible label was named but not spelled out (§4.4). Two smaller things
followed: the section count now derives from the list rather than from a second predicate (§4.2),
and §8's typecheck command is the one a clean clone can actually run.

**This file is the whole plan and it stands alone.** Requirement source is
`03-profile-and-collection.md` in `D:\works\magnus\b-new-app\docs\educational`, read through the
decisions in §2 and §3. Where this plan and that document disagree, §2 says so and why. Nothing
outside this repository has to be opened to execute it.

**Prerequisites: none for §5's F3a.** The local collection (`d481648`) holds everything the
browse surface renders, and no server change, migration, `db:push` approval or new dependency is
needed for it. **F3b is gated** on one product decision — §10's question 1, two new native
dependencies — and is the only part of this plan that needs a prebuild.

---

## 0. Why this phase looks smaller than document 03

Two capabilities the document asks for were cut by the product owner on 2026-09-17, before this
plan was written, and both cuts remove work rather than defer it:

- **No denominators.** `GET /api/dance/catalog-summary` was cut
  (`plans/educational-app-level-filter.md` §0): the brief allows this app exactly two server
  connections — the moves list and the scan — so there is no catalog total to show. "45 of 800
  moves learned" becomes **"45 moves learned"**, and a style row shows the learned count alone.
  Document 03 §2's `catalogMoveCount` row, its "Style progress" row and §9's second checkbox are
  knowingly not met.
- **No analytics.** Document 03 §8 lists five events. `apps/edu/AGENTS.md` bans an event pipeline
  in this app. None of the five is built, and none is stubbed.

Neither is an oversight to be corrected during implementation. Anyone re-adding them needs a new
owner decision, not a code review comment.

---

## 1. What exists today

| Piece | Where | State |
|---|---|---|
| Routes | `apps/edu/src/app/profile/index.tsx`, `profile/[moveId].tsx`, `profile/style/[styleId].tsx` | Thin, param-guarded, already declared in the root `Stack` |
| Screens | `apps/edu/src/features/profile/ui/*.tsx` | Three `PlaceholderScreen`s; this phase replaces all three |
| Collection model | `apps/edu/src/lib/collection/` | Complete. `averageScore` (`collection.ts:63`), `learnedCount` (`:70`), `learnedCountByGenre` (`:75`), `deletePersonalRecording` (`:91`), and the atoms in `atoms.ts` |
| Recording files | `apps/edu/src/features/scan/recording-store.ts` | `personalRecordingUri` resolves a pointer; `reconcilePersonalRecordings` runs once per launch from the root layout |
| Genres | `apps/edu/src/features/feed/_atoms/queries.ts:11` (`feedGenresAtom`) | A suspense query, in-memory cache only — §4.1 moves it |
| Entry from the feed | `apps/edu/src/features/feed/ui/feed-screen.tsx` → `onOpenProfile` | Already wired to `/profile` |
| Entry from the scan | `apps/edu/src/app/move/[moveId]/result.tsx` `onFinished` | `router.dismissTo("/")` then `router.push("/profile")` |

The profile therefore has its data, its routes and both of its entry points already. What it does
not have is a single pixel of its own UI.

---

## 2. Where document 03 and this app disagree

### 2.1 `userId` is not part of any key

Document 03 §5 keys `LearnedMove` and `PersonalRecording` by `userId` + `moveId`. This app has no
user ids by design, and the anonymous session can be lost and replaced; `apps/edu/AGENTS.md`
requires content-id keys for exactly that reason. The shipped records are keyed by `moveId`
alone (`apps/edu/src/lib/collection/types.ts`). Nothing in F3 reintroduces an owner key.

### 2.2 "Get the catalog total from the backend or configuration" — neither

See §0. A configuration constant was considered and rejected with the endpoint: a hardcoded
denominator is a number that is wrong the day after an admin publishes a move, and it would be
wrong silently.

### 2.3 Offline is a requirement, and style names are the only thing that is not local

Document 03 §6 requires the profile to render cached learned moves and local videos offline.
Every value on the screen is already local except one: the **style names** for the section
headers, which come from `GET /api/dance/genres`. React Query's cache is in memory, so a cold
launch with no network today has no names at all.

**Decision: persist the last successful genres payload** (§4.1). The profile then renders its
sections offline, from the same store as everything else it shows.

### 2.4 Thumbnails are remote, and that is accepted

Document 03 §7 asks for "separate compressed thumbnails". `LearnedMoveSnapshot.thumbnailUrl` is a
remote URL captured at learn time. `expo-image`'s disk cache makes a previously seen card render
offline, but a card whose thumbnail was never fetched shows its placeholder background offline.
That is the accepted v1 behaviour; do not add a thumbnail download path to "fix" it.

**03 §7's "load thumbnails as their style rows approach the visible screen area" is met
horizontally and knowingly not met vertically.** Each style row is a horizontal `FlatList`, so a
card off the right edge does not mount and its thumbnail is never requested. The vertical
container is a `ScrollView` (§4.4), so every *section* mounts at once. The ceiling that makes this
acceptable is not the collection size but the genre count: at one row per genre and ~4 mounted
cards per row, opening the profile requests on the order of 32 thumbnails, and that number does
not grow as the user learns more moves. Turning the page into a sectioned `FlatList` to save those
requests is not worth the gesture risk in §9; revisit only if the genre list grows past a screen
or two.

### 2.5 The snapshot is never refreshed

`plans/educational-app-features.md` §3.4 settled this when S2 was cut: the card and the detail
screen render `LearnedMove.move` — title, thumbnail, genre ids, level, video url — exactly as it
was at learn time. A move renamed or unpublished later still renders. **No screen in F3 fetches a
move.**

### 2.6 03 §6's "Delete fails → keep the video and offer Retry" is met for one failure only

Document 03 §6 asks a failed deletion to keep the thumbnail and the video on screen and offer
**Retry**, removing them from the UI only once deletion is confirmed. Deletion here is two steps
in a fixed order (§3): drop the MMKV pointer, then delete the file. That order is not negotiable —
a pointer that outlives its file is the one state that renders a broken video — and it decides
which half of 03 §6 is reachable:

- **The pointer write is rejected.** The recording is still in the collection, the section is
  still on screen, and **Retry is exactly right.** This is the case the UI implements.
- **The file delete fails.** The pointer is already gone, so `personalRecordingsAtom[moveId]` is
  `undefined` and the section has already left the screen. There is nothing to keep visible and
  nothing a Retry could act on. The orphaned file is collected by `reconcilePersonalRecordings`
  on the next launch — the mechanism that exists for exactly this leak
  (`apps/edu/src/features/scan/recording-store.ts:125`).

This is also the limit of what the code can observe: `deleteFileIfPresent`
(`recording-store.ts:49`) swallows its errors by design, and rewriting it to throw would buy a
Retry with no UI left to render in. **03 §6 is therefore met for the pointer failure and knowingly
not met for the file failure.** Do not "fix" this by deleting the file first.

### 2.7 There is no "not synchronized" indicator, because there is no synchronization

Document 03 §6 asks the offline state to "add a small indicator if data is not synchronized".
Nothing on this screen ever synchronizes: learned moves, scores and recordings are local by design
(`apps/edu/AGENTS.md`, and `README.md:60` in the document set forbids a profile sync service), and
the one remote value — §2.3's style names — caches admin catalog data, not the user's own. An
indicator would describe a pipeline this app does not have, and would imply the collection is at
risk until it uploads, which is the opposite of the truth. **Not built, by decision.** An offline
profile looks exactly like an online one; only a style name that was never fetched can be missing,
and §4.1's disk cache is what makes even that rare.

---

## 3. Decisions locked in

| Topic | Choice | Why |
|---|---|---|
| Data source | Local collection only; zero move fetches | §2.5; makes the whole surface work offline by construction |
| Denominators | None, anywhere | §0 |
| Analytics | None | §0 |
| Style sections | **All** genres, in the server's `sort_order`, learned or not | 03 §2; the order already lives in `dance_genres.sort_order` (admin data), as the feed's filter comment records |
| Style order vs learned-first | Fixed server order in v1 | 03 §11 presents learned-first as a preference; a stable order is cheaper to reason about and to test |
| Within a style | `learnedAt` descending, tie-break on `moveId` | 03 §2 "most recently learned first"; the tie-break keeps the order stable when two saves share a millisecond |
| Row length | 4 slots at ~3.5 cards visible, learned cards first, then neutral placeholders | 03 §2 |
| Average Score ring | Built in-house from two masked halves; **no `react-native-svg`** | The repo has no SVG dependency at all; a percentage arc does not justify the first one. Revisit only if the design needs gradient strokes or caps |
| Empty average | `--`, never `0%` | 03 §2 and the shipped `averageScore` contract (`null` at zero learned moves) |
| Detail video | `LearnedMoveSnapshot.videoUrl`, played with `expo-video` | Already resolved through the feed's fallback chain at learn time |
| Delete Video | Drops the pointer first, then deletes the file. **Retry covers the pointer write only** | A pointer to a missing file is the one state that renders a broken video; the reverse order creates it. Once the pointer is gone the section is gone, so a file failure has no UI left to retry from — the next launch's reconciliation collects it (§2.6) |
| Scan Again | `router.push("/move/<id>/scan")` | Reuses F2 unchanged; the flow's own exit already lands on the profile |
| Download / Share | **F3b, behind §10 question 1** | Two new native dependencies and a prebuild; they must not hold up the browse surface |

---

## 4. Architecture

### 4.1 Genres move out of the feed, and gain a disk cache

`feedGenresAtom` is a feed internal, and the profile may not deep-import another feature
(`apps/edu/AGENTS.md`). Genres are app-wide catalog data with two consumers, so they move to the
`lib/` layer beside the other app-wide model:

```
apps/edu/src/lib/catalog/
  genres.ts        # genresAtom (suspense, the feed's) + genresQueryAtom (non-suspense)
                   # + cachedGenresAtom (MMKV) + writeGenresCacheAtom
  use-genres.ts    # useGenres(): the cached list first, the query second
                   # useGenresCache(): the write-through, mounted once by the root layout
  index.ts
```

**Two atoms over one query, because the two screens need opposite failure behaviour.** The feed
renders genres inside a `Suspense` + `MobileQueryErrorBoundary` pair it already owns
(`features/feed/ui/feed-screen.tsx:46`), so it keeps the suspense atom. The profile has to render
offline from disk, so it may neither suspend nor throw. Both atoms declare the **same** `queryKey`
and `queryFn`, so React Query holds one cache entry and one in-flight fetch:

- `genresAtom` — the shipped `atomWithSuspenseQuery`, moved verbatim. The feed's only change is
  its import path.
- `genresQueryAtom` — the same config through `atomWithQuery`, plus `enabled: auth !== null`, so a
  missing session is a disabled query rather than a thrown `requireAuth`.

The rest of the move:

- Key `["feed-genres", userId]` stays as it is in both atoms, so F1's cache identity and
  `AnonymousSessionProvider`'s cancellation (which scopes on key index 1,
  `lib/auth/session-provider.tsx:82`) are unaffected. Rename the key only if a test forces it;
  nothing here requires it.
- `cachedGenresAtom` reads `persistedEduAtom<unknown>("genres", [])`
  (`apps/edu/src/lib/jotai/atom-with-mmkv.ts`) through a coercion, the way the collection reads its
  records: store `unknown` and expose the coerced value (`collection/atoms.ts:19`), dropping any
  entry without a string `id`, a non-empty `name` and a finite `sortOrder` rather than trusting
  the stored blob.
- **The write-through is a `useEffect`, not an `atomEffect`.** This repo has no `jotai-effect`
  dependency and F3a adds none. `useGenresCache()` subscribes to `genresQueryAtom` and writes each
  new successful payload through `writeGenresCacheAtom` (`useSetAtom`), comparing against what is
  already stored so a refetch returning the same list does not write.
- **The write-through is mounted by the root layout, not by the profile.** A cache only the
  profile fills is empty in the one case §2.3 exists for: a user who has only ever used the feed
  online opens the profile for the first time offline and gets no section names at all. The feed
  reads `genresAtom` and would never write. `use-genres.ts` therefore exports `useGenresCache()`
  alongside the reader, and `apps/edu/src/app/_layout.tsx` mounts it in a null-rendering component
  beside `PersonalRecordingReconciliation` — below the session gate, so `enabled: auth !== null`
  is already satisfied, and once for the whole app, so there is exactly one writer. It costs no
  extra fetch: the feed is the first screen and shares the query key.
- `useGenres()` returns **the query's data when it has some and the coerced cache otherwise**, so
  the profile paints its sections immediately on a cold offline launch and replaces them when the
  query lands. A profile that spins offline fails 03 §6. It also reports `isPending`, which §4.4
  needs to tell an unknown genre list from an empty one.
- The feed imports `genresAtom` from `@/lib/catalog`; `features/feed/_atoms/queries.ts` keeps
  `feedMovesInfiniteAtom` and re-exports nothing.

### 4.2 Three pure helpers, added to the collection model

All three go in `apps/edu/src/lib/collection/collection.ts` beside the existing rules, with unit
tests in `apps/edu/src/lib/collection/__tests__/collection.test.ts`. None of them touches React:

```ts
/** Learned moves in one genre, most recently learned first, stable across equal timestamps. */
export function learnedMovesByGenre(
  moves: Record<string, LearnedMove>,
  genreId: string,
): LearnedMove[];

/** Every learned move, same ordering rule — the source for a future "all moves" surface and for tests. */
export function learnedMovesSorted(moves: Record<string, LearnedMove>): LearnedMove[];

/** 0..100 integer for the ring's fill, or null at zero learned moves. Rounds once, here, so the
 *  ring and the label can never disagree. */
export function averageScorePercent(moves: Record<string, LearnedMove>): number | null;
```

`learnedCountByGenre` (`collection.ts:75`) and its atom family stay exported — they are shipped
and tested (`__tests__/atoms.test.ts:78`) — but **no F3 screen calls them.** The section header
reads the length of `learnedMovesByGenreAtomFamily(genreId)`, so one `genreIds.includes` predicate
answers both the count and the list and the two can never disagree. A second counting path over
the same rule is how they drift, and the family recomputes on every collection change either way,
so nothing is bought by keeping them separate.

**A move in two genres appears in two sections, and that is the intended behaviour.**
`LearnedMoveSnapshot.genreIds` is an array and the section predicate matches it with `includes`,
so the section counts sum to more than `learnedCount` as soon as one move carries two genres. The summary is the only place a move is counted exactly once. Neither number is wrong —
they answer different questions — and no screen presents one as a share of the other, because §0
removed the denominators that would have made the difference look like a bug. State it in a test
rather than discovering it in the UI, exactly as §6 does for the move that matches no genre.

Two derived atoms go beside the existing ones in `apps/edu/src/lib/collection/atoms.ts` and are
exported from `collection/index.ts`, next to `learnedCountByGenreAtomFamily` (`atoms.ts:34`):

```ts
export const learnedMovesByGenreAtomFamily = atomFamily((genreId: string) => /* … */);
export const averageScorePercentAtom = /* … */;
```

The screens read those atoms and never call the pure helpers directly, so a section does not
re-sort its list on every render of its neighbour. `profile/_atoms/ui.ts` stays what §4.3 says it
is — transient screen state only; nothing derived from the collection lives in the feature.

### 4.3 Feature layout

```
apps/edu/src/features/profile/
  index.ts                      # ProfileScreen, ProfileStyleScreen, ProfileMoveScreen — unchanged exports
  _atoms/
    ui.ts                       # transient screen state (delete confirmation, retry flags)
  ui/
    profile-screen.tsx          # header, summary, style sections
    profile-summary.tsx         # Average Score ring + learned count, ~50/50
    average-score-ring.tsx      # the dependency-free arc
    style-section.tsx           # header row (name, count, See More) + horizontal list
    learned-move-card.tsx       # thumbnail, name, saved score; takes the style name as a prop
                                # for its accessible label (§4.4)
    empty-slot.tsx              # neutral, non-interactive, visibly not a skeleton
    profile-style-screen.tsx    # See More: every learned move in one style
    profile-move-screen.tsx     # detail: official video, name, score, Scan Again, My Video
    personal-video-section.tsx  # thumbnail + Play / Delete (+ Download / Share in F3b)
```

Rules the existing app already enforces and this phase inherits: routes stay thin and keep their
`isUuidParam` guards; styling is `className` with the Stepz tokens and **no raw hex**; a
`FlatList` gets a stable `keyExtractor`; every interactive element carries a role and a label.

### 4.4 Screens, precisely

**Profile overview** (`/profile`)

1. Top bar: a back action to the feed (`router.dismissTo("/")`, already wired) and the title
   **My Profile**.
2. Summary, two tiles at ~50/50: the ring with the numeric percentage and the label
   **Average Score** inside it, `--` at zero; beside it **`<n>` moves learned**, singular at 1.
3. One vertical `ScrollView` (not a `FlatList` — the section count equals the genre count, which
   is small and fixed) holding one `StyleSection` per genre.
4. **While the genre list is unknown, the sections are a skeleton — not zero sections.**
   `useGenres()` (§4.1) returns an empty list both when the user genuinely has no genres and when
   the first launch's query is still in flight with an empty disk cache, and 03 §6 forbids
   rendering a false empty in the second case. Render `DanceSkeleton`
   (`@bnewapp/mobile-kit/ui`, the feed's) in the sections' place while `isPending` and the cache is
   empty; drop it the moment either source has a list. The summary never skeletons — it is local
   and synchronous — so this is the screen's only loading state, and it is what §6's "empty slots
   are visibly different from the loading skeleton" is asserting against.
5. Each section: header row with the style name on the left and **See More** on the right
   (label "See more `<style>` moves"), the learned count under the name, then a horizontal
   `FlatList` with `showsHorizontalScrollIndicator={false}`, card width set so ~3.5 fit the
   viewport, learned cards first and `EmptySlot`s padding the row to 4.
6. See More is present for every style; for a style with nothing learned it is disabled rather
   than hidden, so the row's shape does not change under the user.
7. **Card accessible name, 03 §7 verbatim: move name, style, level and saved score** — everything
   but the style name is on the snapshot, and the style is the section the card is in, so the
   section passes it down rather than the card resolving a genre id. A card in a section whose
   genre resolved to no name falls back to the other three parts rather than announcing an id.

**See More** (`/profile/style/[styleId]`)

A vertical grid of every learned move in that style, same card and same order, with the style
name as the title. No paging: the list is local and bounded by what the user has learned.

**Learned move detail** (`/profile/[moveId]`)

1. The official video from the snapshot, full-bleed vertical, play/pause, **paused on blur and on
   background** (03 §7). Two mechanisms, named separately because only one of them is ours:
   `useFocusedPlayback` (`@bnewapp/mobile-kit/media/use-focused-playback`) covers **blur** — it
   reacts to `useIsFocused()` and to nothing else — and F1 already uses it. **Background is
   `expo-video`'s**, whose `staysActiveInBackground` defaults to `false`; no file in this repo
   touches `AppState`. Leave that option at its default and verify the behaviour on the device
   (§7). If it ever has to be `true` for another reason, this screen then owns an `AppState`
   listener of its own — do not assume the hook grew one.
2. Move name and the saved score.
3. **Scan Again** → `/move/[moveId]/scan`.
4. **My Video**, rendered only when `personalRecordingsAtom[moveId]` exists: a player over
   `personalRecordingUri(fileName)` plus the action row.
5. A move id that is not in the collection (a hand-typed url, or a record dropped by coercion)
   renders a short "not in your collection" state with a back action — not a crash and not an
   empty screen.

### 4.5 Personal-video actions

| Action | Phase | Implementation |
|---|---|---|
| Play | F3a | `expo-video` over the resolved uri; no copy, no export |
| Delete Video | F3a | Confirm (`Alert.alert`, destructive), then `deletePersonalRecordingAtom` (pointer), then delete the file. `recording-store.ts` gains one export — `deletePersonalRecordingFile(fileName: string): void` — reusing its private `deleteFileIfPresent`, which swallows a file failure by design. **Read `fileName` into a local before the pointer write:** the write is what removes `personalRecordingsAtom[moveId]`, so a handler that reaches for the name afterwards finds `undefined` and leaks the file on every single delete until the next launch collects it. **Retry is the pointer write's:** if the collection still shows the recording after the write, keep the section on screen and offer Retry. A file that could not be deleted is collected by the next launch's reconciliation (§2.6) |
| Download | F3b | `expo-media-library` `saveToLibraryAsync`, permission requested at the tap and never at mount; failure keeps the video and explains the next step (03 §6) |
| Share | F3b | `expo-sharing` `shareAsync` on the resolved uri; a cancelled share changes nothing |

Deleting a recording never touches the learned move or its score — that is already the shipped
contract of `deletePersonalRecording` (`collection.ts:91`) and it gets its own test here too,
because F3 is the first screen that can reach it.

### 4.6 Navigation

`/` → `/profile` → `/profile/style/[styleId]` → `/profile/[moveId]` → `/move/[moveId]/scan` → F2.

F2's exit is unchanged and is deliberately *not* a return to the detail screen: the result screen
dismisses to the feed and pushes `/profile` (03 §4 and §10 make My Profile the destination). The
known consequence — a Scan Again started from a detail screen loses that screen and the profile's
scroll position — is accepted in v1 and is listed in §10 so the owner can overrule it cheaply.

---

## 5. Build order

**F3a — the browse surface** (no new dependency, one commit)

1. §4.2's three pure helpers with their unit tests. Nothing renders yet; this is the cheapest
   thing to get wrong late.
2. §4.1's genres move, its non-suspense reader, its disk cache and the root layout's
   `useGenresCache()` mount, with three tests: the profile renders its sections from the cache
   when the query throws, and when the query never resolves; and a successful payload reaches the
   cache without the profile ever mounting, which is what makes the first offline visit work.
3. Summary tile and ring, then the style sections, then the cards and empty slots.
4. See More screen.
5. Detail screen with the official video, score, Scan Again, and the My Video section limited to
   Play and Delete.
6. Device run (§7), then the commit.

**F3b — export actions** (blocked on §10 question 1, separate commit)

7. Add `expo-media-library` and `expo-sharing` to `apps/edu` only, at the versions Expo SDK 55
   pins; declare the iOS usage strings in `app.config.ts`; `corepack pnpm edu:prebuild`.
8. Download and Share, their permission and failure states, and a second device run.

Splitting here is the point: F3a is the phase's whole product value, and it must not wait on a
dependency approval, a prebuild or a store-privacy answer.

---

## 6. Acceptance

Document 03 §9, item by item, with this app's two knowing omissions marked:

- [ ] Profile shows Average Score and the learned move count.
- [ ] ~~Catalog total comes from the backend or configuration~~ — **not met by decision** (§0).
- [ ] With no saved scores, Average Score shows `--` and the ring renders empty.
- [ ] Style sections show the learned count. ~~And the style total~~ — **not met by decision**.
- [ ] Style rows scroll horizontally without blocking the vertical page scroll; cards show
      thumbnail, move name and saved score.
- [ ] See More lists every learned move in the selected style, in the same order.
- [ ] Empty slots are non-interactive, and visibly different from the loading skeleton.
- [ ] Each card opens the matching detail screen.
- [ ] A learned move exists independently of its personal recording.
- [ ] Delete Video removes only the recording; the learned move, its snapshot and its score stay.
- [ ] Download and Share appear only when a recording exists, and only act on a user tap. *(F3b)*
- [ ] Returning from detail restores the profile's scroll position.
- [ ] Scan Again changes the saved score only after **Continue and Save your Score**, and the
      Average Score recalculates after that save.

Beyond the document, these are the cases this app's own shape makes worth testing:

- [ ] `averageScore` of saved scores 20 and 100 renders **60%** — 03 §2's arithmetic, verbatim.
- [ ] The profile renders fully with the network off: sections from the persisted genre list,
      cards from the collection, videos from disk.
- [ ] A session that only ever opened the feed still leaves the genre names on disk, so the first
      profile visit after that — offline, on a later launch — has its section headers (§4.1).
- [ ] An unknown genre list renders the skeleton, not zero sections; a known-but-unlearned style
      renders empty slots. The two are visibly different (§4.4).
- [ ] Each card's accessible name carries the move name, its style, its level and its saved score.
- [ ] A learned move whose catalog row was unpublished still renders from its snapshot.
- [ ] A learned move whose `genreIds` matches no genre is not lost — it appears under no section,
      and the summary's learned count still includes it. State the expected behaviour in the test
      rather than discovering it in the UI.
- [ ] A learned move in two genres appears in both sections and is counted once by the summary,
      so the section counts sum to more than the learned count (§4.2).
- [ ] Deleting the last recording in the collection leaves the learned move visible.
- [ ] A rejected pointer write leaves the video on screen with a Retry, and deleting again from
      that state succeeds and removes the section.
- [ ] A file that could not be deleted does **not** keep the section on screen — the pointer is
      already gone — and the next launch's reconciliation collects the file (§2.6).

## 7. Device checklist

The Android device that closed P0 is sufficient; iOS stays unexercised (§9).

- [ ] Horizontal row scroll does not steal the vertical page scroll, and vice versa.
- [ ] ~3.5 cards are visible at rest, so more content to the right is obvious.
- [ ] Detail video pauses on Back and on backgrounding, and does not keep audio alive. The
      background half is `expo-video`'s default rather than `useFocusedPlayback`'s doing (§4.4),
      so this check is the only place it is verified at all.
- [ ] Back from the profile reaches the feed; Back from a detail reaches the profile at its
      previous scroll position.
- [ ] Scan Again completes the F2 flow and lands on the profile with the new score applied.
- [ ] Touch targets ≥ 44pt, including See More and the video actions.
- [ ] *(F3b)* Download writes to the gallery with the permission prompt appearing at the tap;
      Share opens the system sheet; cancelling either changes nothing.
- [ ] Storage readout after ~10 saved recordings, per `plans/educational-app-features.md` §6.

## 8. Validation

```sh
corepack pnpm exec turbo run typecheck --filter=@bnewapp/edu
corepack pnpm --filter @bnewapp/edu test
corepack pnpm typecheck && corepack pnpm test && corepack pnpm lint
```

The first command is the Turbo one on purpose: `@bnewapp/types` resolves to `dist` for `tsc`, so
a bare `--filter @bnewapp/edu typecheck` fails on a clean clone until the dependency is built
(`apps/edu/AGENTS.md`).

`@bnewapp/admin`'s test task fails on a missing `apps/admin/.env.local` in this environment; that
is pre-existing and recorded under P0 in `plans/educational-app.md`.

## 9. Risks

| Risk | Why it matters | Handling |
|---|---|---|
| Nested horizontal lists inside a vertical scroll | The classic RN gesture conflict, and invisible in jest | Build step 3 of F3a on the device before the rest, the way F1 handled the tempo bar |
| The ring without SVG | A masked-halves arc is fiddly at 0%, 50% and 100% | Unit-test the fill computation separately from the view, and check the three boundaries on the device |
| `expo-media-library` on iOS | New usage strings and store privacy answers, on a platform this app has never built | F3b only; lands **declared but unexercised** on iOS and is recorded as outstanding, exactly as P0 did |
| Recordings accumulate | One per move, no cap | §7's storage readout; a cap is a product decision, not an implementation detail |
| Scroll position across the scan flow | F2's exit rebuilds the profile | Accepted in v1; §10 question 3 |

## 10. Open decisions

| # | Question | Blocks | Recommendation |
|---|---|---|---|
| 1 | Approve `expo-media-library` + `expo-sharing` in `apps/edu`, with the prebuild and iOS usage strings they require? | **F3b only** | Approve — Download and Share are document 03 §3 features, and nothing else in the app needs a prebuild |
| 2 | Is "`<n>` moves learned" with no denominator the final copy? | Copy only | Yes; it follows from the cut catalog summary (§0) |
| 3 | After Scan Again from a detail screen, return to the detail screen instead of the profile? | Navigation | Keep the profile (document 03 §4); revisit if the device run makes the loss feel wrong |
| 4 | Styles with learned moves before the fixed order (03 §11)? | Section order | Fixed order in v1 |
| 5 | Delete Video's button size, and the move name's placement on the card (03 §11) | Design | Implementer's call within the token set; confirmation before deletion is required either way |

## 11. Where this plan stops

At a Stepz whose three surfaces are all real: browse, scan, remember. It does **not** cover:

- **S3 — the retention backstop**, which is still unbuilt and is now the only server-side work
  left in the programme. Two findings from 2026-09-17 belong to it, not here: there is no
  retention sweep anywhere in `apps/server` (the comment in
  `apps/edu/src/features/scan/_atoms/mutations.ts` that calls one "the backstop" describes
  something that does not exist), and an anonymous caller can create posts at the global rate
  limit. Both are S3's scope in `plans/educational-app-features.md` §5.
- F4 (likes), which stays unscheduled pending the owner's answer to §8 question 3 of that plan.
- Any second app's reuse of what F3 builds; the profile is Stepz-specific and stays in `apps/edu`.
