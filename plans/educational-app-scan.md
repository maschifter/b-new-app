# Stepz — F2: The Scan Seam

Status: **implemented 2026-09-17; §7's device checklist is still open.** Written the same day
against `c61d55b`; every file and line reference below was checked against the working tree as it
stood then. Revised after a readiness review against that commit — §2.4, §3.1, §4.1, §5.1, §7
and §8. The review found no false reference and no gap in scope; every revision closes an
instruction the plan left to the implementer's judgement.

Every automated box in §7 is written and green, and §8's commands pass. Three things the
implementation had to decide that the plan did not:

- **`@bnewapp/dance-flow` gained a second `exports` entry beyond §4.1's.** `deriveSubmissionState`
  takes `isScorePollingSlow`, and §4.1 has Stepz restating the slow-score string, so
  `./score-polling` is exported alongside `./submission-state`. Both are new keys over existing
  dependency-free modules; no file moved and no `apps/mobile` call site changed.
- **§5.4's hook is reached through `@/features/scan/reconciliation`, not `index.ts`.** That index
  re-exports `RecordDanceScreen`, so the root layout importing the hook from it pulls the camera
  and audio stack into the root module graph — the exact trap `@bnewapp/dance-flow/dev` exists to
  avoid. The feature therefore has two public entries, on that package's own precedent.
- **§4.3's save failure splits in two.** A missing move clears itself the moment the query yields
  a snapshot, so its retry is a refetch; a failed write must wait for an explicit re-attempt or
  the effect loops. Collapsing both into one flag raced: the snapshot could arrive after the
  retry reset the state, and the save was then never re-attempted.

**This file is the whole plan and it stands alone.** Requirement source is
`02-scan-score-and-save.md` in `D:\works\magnus\b-new-app\docs\educational`, read through the
decisions in §0. Where this plan and that document disagree, §2 says so and why. It points at
no other plan for anything it needs; `plans/educational-app-features.md` §5 is where F2 sits in
the programme, and `plans/educational-app-collection.md` is the *completed* model this phase is
the first consumer of.

**Prerequisites: none left.** D1 shipped the local collection (`d481648`), S1 shipped the level
filter (`6f29c05`), F1 shipped the feed (`6c03342`, `c61d55b`). The feed's **Dance this Move**
already reaches `/move/<id>/scan` (`apps/edu/src/features/feed/ui/feed-screen.tsx:343`) and the
record screen already hands a clip to `/move/<id>/result`. This phase replaces what that result
route renders.

**One caveat carried in from F1, and it is not a blocker.** F1's device checklist was run only
in part and `plans/educational-app-feed.md` §7 still has open boxes; four review findings on the
feed were raised and not fixed (§1.3). None of them touches the scan seam. Close them on their
own schedule, not inside this phase.

---

## 0. What is decided before a line is written

These are settled elsewhere and are **not** to be re-opened inside the implementation.

| Topic | Decision | Source |
|---|---|---|
| Who owns the result screen | **Stepz writes its own** over `@bnewapp/dance-flow/atoms`. The shared `DanceResultScreen` is not parameterised | `features.md` §4.2 |
| Score rule | **Replacement, not best-of.** A confirmed lower score replaces a higher one | 02 §2, `collection.ts:46` |
| First scan | Saves automatically, with no confirmation | 02 §2 |
| Fallback score | A server fallback score **does** create a learned move; `isExternalScore` is stored so the call stays reversible | `collection.md` §2 |
| Average Score | Derived, never stored; `--` at zero learned moves | 02 §6, `collection.ts:63` |
| Personal video | At most one per move, device-only, **never uploaded** | 02 §7, `apps/edu/AGENTS.md` |
| Temporary scan upload | Required, goes to Storage, **deleted once the score is terminal** | `features.md` §4.5 |
| Upload disclosure | **None ships.** No string may state or imply the clip stays on the device | `features.md` §3.3 |
| Analytics | **Not built.** 02 §9's three events are dropped for this app | `apps/edu/AGENTS.md` |
| Exit | Dismiss the scan stack to the feed, *then* push the profile | `features.md` §4.6 |

---

## 1. What already exists

### 1.1 The flow, end to end, already runs

Everything from the CTA to a terminal score is built and was watched on a device during F1's
pass. The pieces this phase composes:

| Piece | Where | What it gives F2 |
|---|---|---|
| `RecordDanceScreen` | `packages/dance-flow/src/ui/record-dance-screen.tsx:64` | The capture. Hands back `{ path, duration, audioOffsetMs? }`; `path` is a **cache** path |
| `submitDanceRecordingMutationAtom` | `packages/dance-flow/src/_atoms/mutations.ts:31` | Create post → upload → queue scan, as one mutation. Resolves to `postId` |
| `startDanceScorePollingAtom` | `packages/dance-flow/src/_atoms/effects.ts:5` | Arms the poll for that `postId` |
| `danceScoreAtom` | `packages/dance-flow/src/_atoms/queries.ts:45` | Polls until `shouldFinishScorePolling` (`packages/dance-core/src/status.ts:43`). No client deadline |
| `deriveSubmissionState` | `packages/dance-flow/src/ui/submission-state.ts:25` | `idle / uploading / scanning / scored / failed`, hook-free |
| `deleteRecordedDancePost` | `packages/dance-flow/src/api.ts:136` | `DELETE /api/dance/posts/:id` — row **and** all three storage objects, idempotent (`apps/server/src/modules/dance/service.ts:438`) |
| The collection | `apps/edu/src/lib/collection/` | `recordFirstScan`, `saveConfirmedScore`, `savePersonalRecording`, `deletePersonalRecording` and their atoms |
| `resolvePreviewMedia` | `packages/dance-core/src/preview-media.ts:26` | The snapshot's `videoUrl`, total: it ends at the non-null `filmYourselfVideoUrl` |

`ScanStatus` carries `{ status, hasScore, score, isExternalScore, jobState }`
(`packages/dance-core/src/types.ts:12`). `dance_posts.score` is `integer` with a `0..100` check
(`supabase/migrations/20260911042414_create_dance_flow.sql:29`, `:38`), which is exactly what
`isValidScore` accepts (`apps/edu/src/lib/collection/coerce.ts:13`) — no rounding is needed at
the boundary, and none may be added.

### 1.2 What the result route renders today

`apps/edu/src/app/move/[moveId]/result.tsx` validates its four params and renders the **shared**
`DanceResultScreen`, re-exported by `apps/edu/src/features/scan/index.ts:5`. That screen shows
"Your result" (`dance-result-screen.tsx:97`), **Record again** (`:108`) and **Done** (`:116`),
and offers no slot for a score confirmation or a video decision. It goes away from this app in
this phase; `apps/mobile` keeps it unchanged.

`apps/edu/src/app/_layout.tsx:52` already declares the result route with `gestureEnabled: false`,
so the flow cannot be swiped away mid-scan.

### 1.3 What F2 inherits and must not absorb

Open against the feed, listed so nobody rediscovers them here and nobody folds them in:

- The Pro Tip overlay is a plain view, not a `Modal`, so Android hardware Back closes the app
  instead of the overlay. **Confirmed on a device.** It is a feed bug; the same trap is designed
  out of F2 in §5.5.
- **Reset filters** is a no-op in the unfiltered empty state.
- `tempo-bar.tsx` sets `accessibilityRole="adjustable"` with no `accessibilityActions`.
- A stale `selectedGenreIdAtom` can render as "All Styles".
- F1's device checklist (`plans/educational-app-feed.md` §7) has open boxes: pull-to-refresh, the
  style filter, infinite pagination and the tempo reset on page change.

And one lesson that **does** apply here, from `c61d55b`: `SafeAreaView` applies an inset as
padding, and an absolutely positioned child is laid out against the border box, so it never
receives it. Every new screen below lays its content out in normal flow; where one does not, the
child carries `useSafeAreaInsets()` itself.

---

## 2. Where document 02 is wrong about this codebase

### 2.1 "Save failure → Retry" describes a network save. The score save is a local write

02 §2 gives the result screen a saving state ("Disable the button while saving") and 02 §8 gives
it a failure ("Score save fails → stay on the result screen and offer Retry"). Both assume the
score is POSTed somewhere. It is not: `saveConfirmedScoreAtom`
(`apps/edu/src/lib/collection/atoms.ts:49`) is a synchronous MMKV write, and the whole point of
`plans/educational-app-collection.md` is that no score ever leaves the device.

There **is** a retriable failure on that screen, and it is a different one:

> The learned move cannot be created without a `LearnedMoveSnapshot` — `title`, `thumbnailUrl`,
> `genreIds`, `level`, `videoUrl` — and the result screen is handed only a `moveId`.

The move comes from `optionalDanceMoveAtomFamily(moveId)`
(`packages/dance-flow/src/_atoms/queries.ts:26`), which shares its query key with the *suspense*
family the record screen already resolved, so in the normal path it is a warm cache read. It can
still be absent: a reload onto the route in development, an evicted entry, a fetch that failed
while the upload succeeded. **So the retriable failure is the move fetch, not the write**, and
§4.3 maps 02's Retry onto it.

`recordFirstScan` and `saveConfirmedScore` are **silent no-ops** when they reject their input
(`collection.ts:25-28`, `:54-55`). A screen that fires one and navigates on would lose a score
without saying so. Every save in this phase therefore reads the collection back and only then
advances — §4.3.

The "disable while saving, repeated taps must not double save" requirement survives intact, but
it guards a double *navigation*, not a double write: both writers are already idempotent.

### 2.2 `scanSessionId` does not exist

02 §2 requires a valid scan to return "at least `moveId`, `score`, and `scanSessionId`", and
02 §9 wants `scanSessionId` in an event. This system's identifier for one attempt is the
**`postId`** returned by `submitDanceRecordingMutationAtom` and held in `activeDanceScanAtom`
(`packages/dance-flow/src/_atoms/ui.ts:13`). There is no session id and none is being added.
Since 02 §9's analytics are dropped for this app (§0), the only place the identifier is needed is
the cleanup in §4.4, which uses `postId`.

### 2.3 "Update the database reference … such as a transaction" is one MMKV key write

02 §5's safe replacement order asks for a transaction around the pointer update. The pointer is
one entry in one MMKV key (`personalRecordingsAtom`, `atoms.ts:66`), so a single `set` **is** the
atomic operation the document asks for. What does not come free is the ordering of the *file*
operations around it, and that is what §5.3 pins down. The document's real requirement — "never
delete the old recording before the new recording is saved and can be played" — is preserved
literally.

### 2.4 In simulated-recording mode the "temporary recording" is a shared cached file

`__DEV__` + `simulatedDanceRecordingEnabledAtom` makes the recorder hand back a file downloaded
once into `Paths.cache/dance-recording-simulation/`
(`packages/dance-flow/src/recording-adapter.ts:42-51`), keyed by source URL and **reused by every
later simulated run**. Deleting it as "the temporary recording" would be wrong twice: it is not
the user's clip, and the next simulated scan would silently re-download it.

**Decision: `@bnewapp/dance-flow` gains one export, `isSimulatedDanceClipPath(path)`, on its
existing `./dev` entry point**, and Stepz refuses to delete a path it matches. The directory name
is the package's knowledge; copying it into the app would be a deep import in all but syntax.
`dev.ts` is already the entry that exists precisely so a host app can reach dev-only surface
without pulling the camera stack (`packages/dance-flow/src/dev.ts:1-4`).

**Where the predicate lives matters, and it is not `recording-adapter.ts`.** That module imports
`expo-file-system` and `../api`, and `dev.ts` exists precisely to stay clear of both — its own
header says to keep it free of screen and api imports, because the root layout imports it. A
re-export from the adapter would pull the network stack into the root module graph and undo the
entry point.

So: put the directory name and the predicate in a new dependency-free module,
`packages/dance-flow/src/simulation-path.ts` — the constant plus
`isSimulatedDanceClipPath(path: string): boolean`, no imports at all. `recording-adapter.ts`
reads the constant from there instead of inlining it, and `dev.ts` re-exports the predicate. One
name, one owner, and `./dev` stays as cheap as it is today.

### 2.5 "The user is inside the silhouette and completes a valid scan"

02's start condition describes a pose-detection preview this codebase does not have and this
phase is not adding; `plans/educational-app-features.md` §3.1 already recorded that. "A valid
scan" here means exactly: the upload succeeded, the poll reached a terminal state, and
`hasScore && score !== null`. A terminal state without a score is a **failed** scan — it creates
no learned move, shows no video decision, and offers no confirmation.

---

## 3. State

```text
apps/edu/src/features/scan/
  index.ts                        # RecordDanceScreen re-export + Stepz's ScanResultScreen
  result-flow.ts                  # PURE: which step the screen is on
  recording-store.ts              # device file lifecycle for personal recordings
  _atoms/
    mutations.ts                  # temporary-upload cleanup
    ui.ts                         # the confirmed-attempt / video-decision progression
  ui/
    scan-result-screen.tsx
    save-video-screen.tsx
    replace-video-screen.tsx
  __tests__/
    result-flow.test.ts
    recording-store.test.ts
  ui/__tests__/
    scan-result-screen.test.tsx
```

This is `plans/educational-app-features.md` §4.1's sketch with one addition: `result-flow.ts`,
pure and hook-free, for the same reason `submission-state.ts` is pure in the package — every
branch of the progression is worth a unit test, and none of them needs a renderer.

`index.ts` stops re-exporting `DanceResultScreen` and exports Stepz's `ScanResultScreen`.
`RecordDanceScreen` is re-exported unchanged. Routes keep importing from `@/features/scan`.

### 3.1 The one piece of client state

```ts
// _atoms/ui.ts
/** The step the result screen is on, once the score is terminal. */
export type ScanDecision = "score" | "video" | "done";
export const scanDecisionAtom = atom<ScanDecision>("score");
```

Nothing else is added. The score, the upload and the poll are already atoms in the package; the
collection is already atoms in `@/lib/collection`. **Do not copy a query result into a second
plain atom** — the rule in `CLAUDE.md` §6, and the reason the attempt's score is read from
`danceScoreAtom` at every step rather than snapshotted here.

`scanDecisionAtom` is plain, not persisted, and resets when the screen unmounts. That is the
mechanism behind 02 §2's "if the user goes back or scans again, do not save the unconfirmed
result": an unconfirmed attempt has no storage to leave it in.

**The transient flags are component state, not atoms.** §4.3's "pressed, not yet advanced"
guard, §4.3's Retry-after-a-missing-move state and §5.3's "the copy is running" flag are all
`useState` inside the screen that owns them. They die with the screen, which is exactly right,
and none of them is read anywhere else — promoting one to an atom would give an unconfirmed
attempt somewhere to survive, which §3.1 has just spent a paragraph denying it.

### 3.2 The cleanup mutation

```ts
// _atoms/mutations.ts
/** Removes the temporary cloud upload once its score is terminal. Fail-soft: S3 is the backstop. */
export const discardScanUploadMutationAtom = atomWithMutation<void, string, Error>((get) => { … });
```

Over `deleteRecordedDancePost` (`packages/dance-flow/src/api.ts:136`), auth read through
`queryAuthAtom` / `requireAuth` exactly as `submitDanceRecordingMutationAtom` does
(`mutations.ts:36-37`). Key `["scan-discard-upload", userId]`.

---

## 4. The result screen

`/move/[moveId]/result` keeps its param validation unchanged and renders `ScanResultScreen`. The
score and video decisions are **states within it**, not routes (`features.md` §4.6).

### 4.1 What it renders while the scan runs

Same composition as the shared screen, and for the same reasons: replay the captured clip looped
and muted through `useVideoPlayer` + `useFocusedPlayback`, submit on mount, arm the poll on
success, derive the message with `deriveSubmissionState`.

Two deliberate differences from `dance-result-screen.tsx`:

- **No synced music track.** The shared screen replays the move's track against the clip
  (`dance-result-screen.tsx:47-52`) because its user is previewing a post that will be merged
  and published. Stepz publishes nothing; the replay exists to give the Save My Video decision
  something to look at. Dropping it removes `useSyncedMusicTrack`, `mergeAudioOffsetMs` and the
  music read from this screen. Reversible in an afternoon if it looks wrong on a device.
- **Back, not Record again.** 02 §2's table names one control: **Back**, "return to the scan view
  for the same move". It is `router.replace("/move/<id>/scan")` — replace, not push, so the stack
  does not grow one result screen per attempt.

`deriveSubmissionState` lives at `packages/dance-flow/src/ui/submission-state.ts` and is **not
in the package's `exports` map**. Add a `./submission-state` entry pointing at that file: it
imports only `@bnewapp/dance-core` and `@bnewapp/types`, so it stays platform-neutral, and a
second copy of a five-branch state machine in this app is exactly the duplication
`packages/AGENTS.md` forbids.

**The state machine is shared; the rendering is not.** `SubmissionFeedback`
(`packages/dance-flow/src/ui/submission-feedback.tsx`) is not exported and **is not being
exported** — Stepz cannot use it. Its `scored` branch renders *"You scored 82 points!"*
(`:26`), and 02 §2 requires **`82 / 100`**, so the one branch that matters is wrong for this
app before any styling question arises. Stepz therefore writes its own feedback component over
the `SubmissionState` union and owns its progress copy.

What that costs is explicit, so nobody rediscovers it as a surprise: the `failed` messages come
free, because `deriveSubmissionState` carries them in the union itself (`submission-state.ts:31`,
`:36`, `:46`). The four progress strings — "Uploading your dance…", "Scoring your dance…",
"Still scoring — you can check back here shortly.", and the scored line — live only in
`SubmissionFeedback`, so Stepz restates the first three and replaces the fourth with `xx / 100`.
Three duplicated strings against a shared five-branch state machine is the right trade; adding a
second parameterised renderer to the package for one app is the shape `features.md` §4.2 already
refused.

### 4.2 The score, once it is terminal

02 §2 requires "**xx / 100**" rendered clearly. The screen shows the score, the move title, and
one primary button — **Continue and Save your Score**, in both the first-scan and the repeat-scan
case, exactly as 02 §2's table specifies.

What differs between the two cases is what already happened, not what is on screen:

| Case | On arrival at a terminal score | On **Continue and Save your Score** |
|---|---|---|
| Move not in the collection | `recordFirstScan` fires **automatically**, saving the first score (02 §2) | Nothing is written. Advance to the video decision |
| Move already in the collection | Nothing is written. The saved score and Average Score are untouched (02 §2) | `saveConfirmedScore` replaces the saved score, then advance |

A **failed** terminal state (§2.5) shows the failure message and **Back** only — no confirmation
button, no video decision, and nothing written to the collection.

### 4.3 Every save reads back before it advances

Both writers reject silently (§2.1), and `recordFirstScan` additionally needs a snapshot that may
not be in cache yet. So:

```text
onTerminalScore:
  move = optionalDanceMoveAtomFamily(moveId).data
  if move is absent   -> render the score with "Couldn't save your score" + Retry (refetch the move)
  if not yet learned  -> recordFirstScanAtom({ moveId, score, isExternalScore, snapshot })
                         then assert learnedMovesAtom[moveId] exists, else the same Retry
```

The snapshot is built from the move with `resolvePreviewMedia` for `videoUrl`
(`preview-media.ts:26`), which is total, so the only field that can fail coercion is a `level`
below 1 or a non-integer — a catalog defect, and the Retry surfaces it rather than hiding it.

**Continue and Save your Score** is disabled from the moment it is pressed until the screen has
advanced, so a double tap cannot fire two navigations. The writes themselves need no guard:
`recordFirstScan` returns the map unchanged when the move is already present (`collection.ts:25`)
and `saveConfirmedScore` is a replacement.

### 4.4 The temporary cloud upload goes away here

The moment the score poll is terminal — scored **or** failed — fire
`discardScanUploadMutationAtom` with the `postId`, once per attempt. It is fail-soft: a failure
is not surfaced, not retried and does not block the screen, because S3 is the backstop and a user
who just danced should not be shown a cleanup error. The `postId` must be captured before
`activeDanceScanAtom` is cleared on unmount.

Deleting the post while its media job is still pending is expected and safe: the merge job is
fail-soft by design (`apps/server/src/modules/dance/service.ts:424-433`) and the media worker's
orphan sweep tolerates a vanished post.

---

## 5. The video decision

Reached only after a score has been confirmed. 02 §3's three states, decided by two facts: does a
valid temporary recording exist, and does a personal recording already exist for this move?

```ts
// result-flow.ts — pure
export type VideoStep = { kind: "none" } | { kind: "save" } | { kind: "replace" };

export function videoStep(input: {
  hasTemporaryClip: boolean;
  hasPersonalRecording: boolean;
}): VideoStep;
```

| `hasTemporaryClip` | `hasPersonalRecording` | Step | Outcome |
|---|---|---|---|
| false | any | `none` | Straight to the profile with the saved score |
| true | false | `save` | **Save My Video** |
| true | true | `replace` | **Do you want to replace your video?** |

"A valid temporary recording" is: the `clipPath` param is a `file://` path, the file exists, and
its size is greater than zero. The route already rejects a non-`file://` path
(`result.tsx:5-7`); `recording-store.ts` answers the rest.

### 5.1 Save My Video — exact strings

02 §4, verbatim, with the move's title substituted into the confirmation:

| Element | String |
|---|---|
| Title | `Nice work!` |
| Confirmation | `<Move title> is now in your collection.` |
| Question | `Save your recording too?` |
| Privacy note | `Your personal video is private and optional. If you choose Not Now, the temporary recording will be deleted.` |
| Primary | `Save My Video` |
| Secondary | `Not Now` |

The privacy note is the one string in this app that talks about a recording, and it deserves more
than an assertion, because `features.md` §3.3 bars any copy that states or implies the clip
stayed on the device and names **these two screens** as the place the bar applies. The argument
that it clears the bar:

1. **The screen is unreachable before the upload is gone.** A video decision is reached only
   after a terminal score (§5's opening line), and §4.4 fires the cleanup the moment the score
   is terminal. By the time the sentence is on screen the upload has been deleted, so "the
   temporary recording will be deleted" is a true statement about the only copy that remains.
2. **It never claims exclusivity.** §3.3's bar is on copy that says or implies the clip *stayed*
   on the device. This sentence says a file will be deleted. It does not say "only", it does not
   say "on this device", and it makes no claim about where the clip has been — which is exactly
   the silence §3.3 chose.

**Where it is thinner, stated rather than hidden:** §4.4's cleanup is fail-soft, so on a failed
delete the upload briefly outlives the sentence, and the sentence is then incomplete rather than
false. That residue is what S3's server sweep exists to collect (`features.md` §4.5), and paying
for it with a *different* string is not open to this phase — §0 settled that no upload
disclosure ships, and 02 §7's proposed wording is barred outright for asserting the opposite of
what happens.

Consequence for the implementation: **do not reword either screen.** 02 §4's and 02 §5's strings
ship verbatim, and any new string added around them is subject to the same bar.

- **Save My Video** → §5.3, then exit.
- **Not Now** → delete the temporary local file (§2.4's guard applies), keep the learned move and
  the saved score, then exit.
- The primary button is disabled while the copy runs.

### 5.2 Replace a saved video — exact strings

02 §5, verbatim:

| Element | String |
|---|---|
| Title | `Do you want to replace your video?` |
| Body | `You can keep one personal video for each move. Saving this recording will permanently replace your previous video.` |
| Primary (destructive) | `Replace Video` |
| Secondary | `Keep Existing Video` |

- **Replace Video** → §5.3, then exit.
- **Keep Existing Video** → keep the old file and pointer, delete the rejected temporary file,
  then exit. The newly saved score stays — 02 §5 says so explicitly.
- A failure keeps the old video and offers **Retry** or **Keep Existing Video** (02 §8).

### 5.3 The safe save, which is also the safe replacement

`recording-store.ts` owns every file operation. `expo-file-system`'s `File` / `Directory` /
`Paths` API is **synchronous** (`node_modules/expo-file-system/build/ExpoFileSystem.types.d.ts`),
so these are throwing calls, not promises — wrap them, do not `await` them.

```text
save(moveId, clipPath, durationS):
  1. ensure Paths.document/personal-recordings/ exists
  2. copy clipPath -> personal-recordings/<moveId>-<epochMs>.mp4   # a fresh name every time,
                                                                   # so a copy never collides
  3. validate: the new file exists and size > 0                    # "ready to play"
  4. savePersonalRecordingAtom({ moveId, fileName, durationS })    # one MMKV key write
  5. read the pointer back; on disagreement delete the new copy    # §2.1's read-back
     and throw
  6. delete the PREVIOUS file, if there was one                    # only now
  7. delete the temporary clip                                     # §2.4's guard applies
```

Step 2 into a unique name is what makes steps 4 and 6 orderable at all: a copy onto the old path
would destroy the previous video before the pointer moved, which is precisely what 02 §5 forbids.
A throw anywhere in 1–3, and a write step 5 finds the store rejected, leave the pointer and the
old file untouched, which is the `Retry` / `Keep Existing Video` state. A crash between 4 and 6
leaks one file, which §5.4's reconciliation collects on the next launch.

**The pointer stores the file name alone, never an absolute path.** The container directory is
reassigned on reinstall and on restore from backup, so a stored absolute path resolves to nothing
on the first launch afterwards — and §5.4 would then read that as "every file is an orphan" and
delete the whole directory. The name is resolved against `Paths.document` at read time, so the
same reconciliation sees an intact collection.

The document directory is used, never the cache directory: `Paths.cache` is reclaimable by the OS
(`node_modules/expo-file-system/build/FileSystem.d.ts:6-8`) and a personal video that disappears
is a broken promise, not a cache miss.

### 5.4 Startup reconciliation, both directions

A `usePersonalRecordingReconciliation()` hook, mounted once in the root layout below the session
gate and run in an effect after first paint — not at module load, because these calls are
synchronous and the directory read would sit on the first frame.

1. Drop every `PersonalRecording` whose `fileName` no longer resolves to a file
   (`deletePersonalRecordingAtom`).
2. Delete every file in `personal-recordings/` that no pointer references.

Both directions, or the device leaks in one of them (`features.md` §4.4). This belongs to F2, not
F3, because F2 is what creates the files.

### 5.5 Hardware Back during a video decision

The video steps are states inside one route, so Android's hardware Back would pop the whole
screen — skipping the decision and leaking the temporary clip. This is the same trap the Pro Tip
overlay fell into (§1.3), and it is designed out rather than discovered on a device.

**Decision: during a video decision, hardware Back performs the secondary action** — **Not Now**
or **Keep Existing Video**. Both are the document's own safe defaults: they never destroy a saved
video, they always clean up the temporary file, and both continue to the profile. Trapping the
user behind a modal with no way out would be worse, and silently popping the screen would leak.

---

## 6. Navigation and exit

```text
/  (feed)  ->  /move/[moveId]/scan  ->  /move/[moveId]/result  ->  (dismiss to /)  ->  /profile
```

The exit is `router.dismissTo("/")` followed by `router.push("/profile")`, not a push onto the
scan stack, because 03 §2 requires Back from the profile to reach the feed (`features.md` §4.6).
`apps/edu/src/app/index.tsx:5` already pushes `/profile` from the feed, so the profile has exactly
one parent either way.

`/profile` is still a placeholder in this phase
(`apps/edu/src/features/profile/ui/profile-screen.tsx`). That is correct and expected: F3 fills
it. What F2 must prove on a device is that the *transition* lands there and that Back from it
reaches the feed — not what the screen contains.

---

## 7. Acceptance

Jest via the shared harness (`@bnewapp/mobile-kit/testing`), tests in `__tests__/` beside the
code. Device checks are named separately because jest cannot judge them.

File I/O is mocked with an explicit `jest.mock("expo-file-system", …)` **inside the two test
files that need it**, not with a file in `apps/edu/__mocks__/`. A `__mocks__` entry adjacent to
`node_modules` is applied automatically to every suite in the app — which is what makes
`react-native-mmkv.js` and `react-native-safe-area-context.js` right to live there and makes a
file-system fake wrong.

**Already covered by D1 — do not write these again.**
`apps/edu/src/lib/collection/__tests__/collection.test.ts` proves the pure rules 02 §10 asks for,
at the layer that owns them: the arithmetic mean and its unrounded form (so 20 and 100 give 60),
a repeat `recordFirstScan` keeping the first score and date, a replacement of a higher score by a
lower one bumping only `updatedAt`, a fallback score creating a learned move that enters the
average, and an invalid score or snapshot leaving the collection untouched. Re-asserting them
through a rendered screen would test D1's module through a slower seam and pin the screen to
arithmetic it does not own.

**Automated — what F2 adds on top of D1**

Each of these is a claim about the *screen's* use of the collection, not about the rules:

- [ ] A first terminal score fires `recordFirstScan` automatically, with the snapshot built from
      the move and `resolvePreviewMedia`, and the learned move exists afterwards.
- [ ] An unconfirmed repeat scan writes nothing: the saved score and Average Score are the ones
      that were there on arrival.
- [ ] **Continue and Save your Score** on a repeat scan calls `saveConfirmedScore` with the
      current attempt's score, including when it is lower than the saved one.
- [ ] Continuing after a *first* scan writes nothing further: no second write, no re-dated
      `learnedAt`.
- [ ] A repeated tap on the confirmation cannot fire two navigations.
- [ ] Saving a score never touches a personal recording.
- [ ] A terminal score with `isExternalScore: true` reaches `recordFirstScan` with the flag
      intact — the screen must not normalise it away.

**Automated — the screen**

- [ ] A terminal score renders `xx / 100` and **Continue and Save your Score**.
- [ ] A terminal state with no score renders the failure and **Back** only — no confirmation, no
      video decision, nothing written.
- [ ] **Back** replaces the route with `/move/<id>/scan` and leaves the saved score untouched.
- [ ] A missing move snapshot renders **Retry**, and a successful refetch then saves the score
      (§4.3).
- [ ] The cleanup mutation fires exactly once per attempt on a terminal score, with the `postId`,
      for a failed scan as well as a scored one.
- [ ] A cleanup failure is invisible: the screen still advances.

**Automated — the video decision**

- [ ] `videoStep` returns `none` / `save` / `replace` for 02 §3's three states.
- [ ] No video prompt appears when no temporary recording exists.
- [ ] **Save My Video** renders 02 §4's five strings with the move's title in the confirmation.
- [ ] The replacement prompt renders 02 §5's four strings.
- [ ] **Not Now** deletes the temporary file, keeps the learned move and its score, and exits.
- [ ] **Keep Existing Video** keeps the old pointer and file, deletes the temporary file, and
      keeps the newly saved score.
- [ ] A copy that throws leaves the old pointer and the old file in place and offers Retry.
- [ ] The old file is deleted **only after** the new file exists and the pointer is written —
      assert the call order, not just the end state.
- [ ] Two taps on **Save My Video** produce one recording.
- [ ] A path under the simulation directory is never deleted (§2.4).
- [ ] Reconciliation drops a pointer whose file is gone, and deletes a file no pointer references.

**Device — required, and not substitutable by tests**

- [ ] A real capture scores, and the score shown matches the one the profile later holds.
- [ ] After a terminal score, `GET /api/dance/posts/:id` 404s — the temporary upload and its
      storage objects are gone. Check the bucket, not just the row.
- [ ] Killing the app between the score and the confirmation resurrects nothing: the saved score
      is the first-scan one, or absent on a repeat.
- [ ] A saved personal video plays back from the document directory after a cold restart.
- [ ] A replacement plays back, and the previous file is gone from the directory.
- [ ] Hardware Back during each video decision performs the secondary action and lands on the
      profile.
- [ ] The exit lands on the profile, and Back from the profile reaches the **feed**, not the
      result screen.
- [ ] The confirmation and the two prompts clear the navigation bar and the status bar on a
      device with three-button navigation (§1.3).
- [ ] Airplane mode during the upload shows the failure and **Retry**, and retrying after
      reconnecting succeeds without creating a second post.

Report the device and OS used, as `apps/edu/AGENTS.md` requires.

---

## 8. Validation

```sh
corepack pnpm --filter @bnewapp/edu test
corepack pnpm --filter @bnewapp/dance-flow test
corepack pnpm exec turbo run typecheck --filter=@bnewapp/edu
corepack pnpm exec turbo run typecheck --filter=@bnewapp/dance-flow
corepack pnpm lint
```

Then the device run. One commit for the phase, Conventional Commits, English only.

The package changes are additive and touch no `apps/mobile` call site:

- §2.4's `simulation-path.ts` plus its `isSimulatedDanceClipPath` re-export from `./dev`. This is
  the one that edits an existing file — `recording-adapter.ts` reads the directory name from the
  new module instead of inlining it — so the existing
  `packages/dance-flow/src/__tests__/recording-adapter.test.ts` is the suite that proves nothing
  moved.
- §4.1's `./submission-state` export entry. New key in the `exports` map, no file touched.

`corepack pnpm --filter @bnewapp/mobile test` is worth running once before the commit anyway,
because the package is shared.

---

## 9. Not in this phase

- **F3 — Profile & collection.** The profile stays a placeholder. F2 proves the hand-off, not the
  destination.
- **S3 — Retention backstop.** §4.4's client delete is one of the two layers
  (`features.md` §4.5); the server sweep and the per-owner rate limit are S3's.
- **Download / Share of a personal video.** F3, and the two dependencies it needs.
- **Analytics.** Dropped for this app (§0).
- **Any change to the shared `DanceResultScreen`.** `apps/mobile` keeps it exactly as it is.
- The four feed findings and the open F1 device boxes in §1.3.

---

## 10. Open decisions

Two, both cheap to settle and neither blocking the start:

1. **Does the result screen replay the clip with the move's music?** §4.1 decides *no* and says
   why. Watch it on a device; if a silent replay reads as broken, `useSyncedMusicTrack` is four
   lines away (`dance-result-screen.tsx:47-52`).
2. **Does a failed scan offer Back only, or Back plus an immediate retry of the whole capture?**
   §4.2 decides Back only, because **Back** already lands on the scan view where the retry is one
   tap. Revisit if the device pass makes it feel like a dead end.
