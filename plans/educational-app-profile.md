# Stepz — F3: Profile & Collection

Status: **planned, not started.** Written 2026-09-17 against `efba755`; every file and line
reference below was checked against the working tree as it stood then. F3 is the last product
phase of the Stepz programme — D1, S1, F1 and F2 are shipped, S3 (the retention backstop) is
still open and is *not* part of this plan.

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

### 2.5 The snapshot is never refreshed

`plans/educational-app-features.md` §3.4 settled this when S2 was cut: the card and the detail
screen render `LearnedMove.move` — title, thumbnail, genre ids, level, video url — exactly as it
was at learn time. A move renamed or unpublished later still renders. **No screen in F3 fetches a
move.**

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
| Delete Video | Drops the pointer first, then deletes the file | A pointer to a missing file is the one state that renders a broken video; the reverse order creates it. A failed file delete is collected by the next launch's reconciliation |
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
  genres.ts        # genresAtom (suspense query) + cachedGenresAtom (MMKV) + the write-through
  index.ts
```

- `genresAtom` keeps the shipped query shape verbatim — key `["feed-genres", userId]` stays as it
  is, so F1's cache identity and `AnonymousSessionProvider`'s cancellation (which scopes on key
  index 1) are unaffected. Rename the key only if a test forces it; nothing here requires it.
- On every successful fetch, write the payload to `persistedEduAtom("genres", [])`
  (`apps/edu/src/lib/jotai/atom-with-mmkv.ts`) — one array, coerced on read the way the collection
  coerces its records: drop any entry without a string `id`, a non-empty `name` and a finite
  `sortOrder`, rather than trusting the stored blob.
- The profile reads **the cache first and the query second**: it renders sections from the
  persisted list immediately, and replaces them when the query resolves. It must not suspend on
  the network — a profile that spins offline fails 03 §6.
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

`learnedCountByGenre` (`collection.ts:75`) already exists and stays the counter; the new list
helper must not become a second counting path — the row header reads the count atom, the row
body maps the list.

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
    learned-move-card.tsx       # thumbnail, name, saved score, a11y label
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
4. Each section: header row with the style name on the left and **See More** on the right
   (label "See more `<style>` moves"), the learned count under the name, then a horizontal
   `FlatList` with `showsHorizontalScrollIndicator={false}`, card width set so ~3.5 fit the
   viewport, learned cards first and `EmptySlot`s padding the row to 4.
5. See More is present for every style; for a style with nothing learned it is disabled rather
   than hidden, so the row's shape does not change under the user.

**See More** (`/profile/style/[styleId]`)

A vertical grid of every learned move in that style, same card and same order, with the style
name as the title. No paging: the list is local and bounded by what the user has learned.

**Learned move detail** (`/profile/[moveId]`)

1. The official video from the snapshot, full-bleed vertical, play/pause, **paused on blur and on
   background** (03 §7) — `useFocusedPlayback`
   (`@bnewapp/mobile-kit/media/use-focused-playback`) is the shipped mechanism and F1 already
   uses it.
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
| Delete Video | F3a | Confirm (`Alert.alert`, destructive), then `deletePersonalRecordingAtom` (pointer), then delete the file. `recording-store.ts` gains one export — `deletePersonalRecordingFile(fileName: string): void` — reusing its private `deleteFileIfPresent`. A failure leaves the UI showing the video with a **Retry** (03 §6) |
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
2. §4.1's genres move and disk cache, with a test that the profile renders its sections when the
   query throws.
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
- [ ] A learned move whose catalog row was unpublished still renders from its snapshot.
- [ ] A learned move whose `genreIds` matches no genre is not lost — it appears under no section,
      and the summary's learned count still includes it. State the expected behaviour in the test
      rather than discovering it in the UI.
- [ ] Deleting the last recording in the collection leaves the learned move visible.
- [ ] A failed file delete leaves the video on screen with a Retry, and the next launch's
      reconciliation collects the file.

## 7. Device checklist

The Android device that closed P0 is sufficient; iOS stays unexercised (§9).

- [ ] Horizontal row scroll does not steal the vertical page scroll, and vice versa.
- [ ] ~3.5 cards are visible at rest, so more content to the right is obvious.
- [ ] Detail video pauses on Back and on backgrounding, and does not keep audio alive.
- [ ] Back from the profile reaches the feed; Back from a detail reaches the profile at its
      previous scroll position.
- [ ] Scan Again completes the F2 flow and lands on the profile with the new score applied.
- [ ] Touch targets ≥ 44pt, including See More and the video actions.
- [ ] *(F3b)* Download writes to the gallery with the permission prompt appearing at the tap;
      Share opens the system sheet; cancelling either changes nothing.
- [ ] Storage readout after ~10 saved recordings, per `plans/educational-app-features.md` §6.

## 8. Validation

```sh
corepack pnpm --filter @bnewapp/edu typecheck
corepack pnpm --filter @bnewapp/edu test
corepack pnpm typecheck && corepack pnpm test && corepack pnpm lint
```

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
