# Stepz (`apps/edu`) — Feed, Scan Flow & Local Profile Plan

Status: **superseded in part — kept for §3 and §8.** Written 2026-09-16 against `4bc91cc`,
the commit that closed C1 in `plans/educational-app.md`; file and line references below were
checked against the working tree on that day and have not been rechecked since.

**Read this file for two things only:** §3, where the source documents and the built system
disagree, and §8, its decision register — six questions, of which **four are still open**;
question 2 was settled by the collection plan and question 5 by a precedent already shipped in
`apps/mobile`. Nothing else here is scheduled work.

- **D1 is superseded.** The local collection model now has its own stand-alone plan,
  `plans/educational-app-collection.md`, which settles §8's question 2 (a fallback score does
  create a learned move, with `isExternalScore` stored so the call stays reversible) and
  replaces §4.3's stored shape — records live under **two keys, each holding one record map**,
  because one atomic write beats the key-per-move layout described in §4.3, which would need an
  enumeration path of its own outside `persistedEduAtom` (it wraps `atomWithStorage` over a
  single MMKV key and exposes no prefix scan). Build from the collection plan, not from D1.
- **S1 is superseded, and half of it is cut.** What remains has its own stand-alone plan,
  `plans/educational-app-level-filter.md`. S1's first deliverable — the `level` filter on
  `GET /api/dance/moves` — survives unchanged. Its second, `GET /api/dance/catalog-summary`,
  was **cut by the product owner on 2026-09-17**: the brief allows exactly two server
  connections (moves + scan), and a catalog-wide denominator is not what this app teaches. The
  profile therefore counts only what is on the device. That reverses §3.6 and moots §3.5; both
  now carry a note, and §5's S1 entry below is stale on the summary. Build from the
  level-filter plan, not from S1.
- **S2 is cut.** `GET /api/dance/moves/by-ids` existed only to refresh the move snapshot
  `LearnedMove` already caches, and §3.4 had settled that the profile "renders from local data
  alone and never depends on a fetch" — so it fixed no failure. The snapshot does not rot on its
  own either: move media lives in the **public** `dance-media` bucket
  (`supabase/config.toml:21-22`) and is served through `getPublicUrl`
  (`apps/server/src/modules/admin/dance-media-service.ts:127`), so its URLs never expire. The
  only drift is an admin editing a published move's title or artwork, and **the product owner
  accepted that staleness on 2026-09-17** rather than carry an endpoint for it. Adding it later
  is additive: one endpoint plus one call when the profile opens.
- **Every other phase (S3, F1–F4) is unscheduled**, and its acceptance criteria were written
  before the decisions in §8 were answered. Each gets a fresh plan when it is next; treat the
  phases here as scope notes, not as an execution order to start from.

This is the follow-up the codebase plan deferred. `plans/educational-app.md` ended at
"`apps/edu` builds, runs and shows a placeholder"; it explicitly left "the feed, the scan
flow and the local profile, plus the server catalog endpoints and the temporary-clip
retention and abuse work they need" to a separate plan. This is that plan.

**Requirement source:** `D:\works\magnus\b-new-app\docs\educational` — the project brief
(`Educational app.md`), the reading guide (`README.md`) and the three flow documents
`01-feed-and-dance-entry.md`, `02-scan-score-and-save.md`, `03-profile-and-collection.md`.
Where this plan and those documents disagree, the disagreement is called out in §3 rather
than silently resolved. Where the documents and the *brief* disagree, the README's
"Source and interpretation notes" already rules for the brief; this plan follows that
ruling and says so each time it matters.

---

## 1. Scope

**In scope.** The three product surfaces and exactly the server work they require:

| Area | Deliverable |
|---|---|
| Feed | Full-screen vertical move feed, level + style filters, tempo control, Pro Tip, profile entry, camera-permission entry to the scan |
| Scan | Stepz's own result surface over `@bnewapp/dance-flow`'s atoms: score confirmation, the separate personal-video decision, and deletion of the temporary cloud upload |
| Profile | Local collection: Average Score, learned-move progress, style rows, move detail, personal-video actions, Scan Again |
| Server | `level` filter, catalog totals, batch move lookup, a retention backstop for anonymous scan posts |

**Out of scope.** Analytics of any kind — the brief forbids it, and both flow documents'
analytics sections are void (`docs/educational/README.md`). Accounts, profile sync, any
second identity surface. Changes to `apps/mobile`'s dance product surface. Pose detection
/ a silhouette *gate* (§3.1). Likes are in scope only as a decision, not as committed work
(§3.2).

**Not a refactor.** `@bnewapp/mobile-kit` and `@bnewapp/dance-flow` are consumed as they
are. A change to either is allowed only when a second app genuinely needs it, and then it
lands in the package with its own test — never as a Stepz-shaped special case.

---

## 2. Current state

### 2.1 What already exists and is reused unchanged

- **The record → upload → score flow.** `@bnewapp/dance-flow` owns the camera capture
  (reference PiP, beat-synced countdown, fixed-length capture), the three-call submission
  (`createDancePost` → signed-URL upload → `markDancePostUploaded`) and the score poll.
  Its atoms are exported through `@bnewapp/dance-flow/atoms`:
  `submitDanceRecordingMutationAtom`, `danceScoreAtom`, `startDanceScorePollingAtom`,
  `activeDanceScanAtom`, `danceMoveDetailAtomFamily`, `optionalDanceMoveAtomFamily`.
- **The dance catalog API.** `GET /api/dance/genres`, `GET /api/dance/moves` (keyset
  cursor + `genre_id`), `GET /api/dance/moves/:id`.
- **Post lifecycle and cleanup.** `DELETE /api/dance/posts/:id`
  (`apps/server/src/modules/dance/service.ts:436`) deletes the row *and* the recording,
  merged video and thumbnail objects, and is idempotent by design.
- **Anonymous identity.** `AnonymousSessionProvider` signs the device in on first launch;
  every dance endpoint is owner-scoped by `request.user.sub` and works for it.
- **Local persistence.** `persistedEduAtom` (`apps/edu/src/lib/jotai/atom-with-mmkv.ts`),
  store id `edu`, namespace `edu:v1:`, keyed by content id and never by an owner id.
- **The route tree.** `app/index.tsx`, `app/move/[moveId]/scan.tsx`,
  `app/move/[moveId]/result.tsx`, `app/profile/index.tsx`, `app/profile/[moveId].tsx`,
  `app/profile/style/[styleId].tsx` all exist and navigate; each renders a placeholder.

### 2.2 The gap, stated as a table

| Requirement | Source | Exists today? |
|---|---|---|
| Vertical full-screen video feed | 01 §2 | **No.** `apps/mobile` has a grid (`choose-dance-moves-screen.tsx`), not a pager |
| Style filter | 01 §2 | Partly — `genre_id` exists server-side; no UI |
| Level filter | 01 §2 | **No.** `dance_moves.level` exists; `DanceMovesQuery` has no `level` |
| Tempo bar (drag, ≥⅓ screen height) | 01 §2 | **No.** "Use the existing tempo component" names a component that is not in this repo. `apps/mobile` has discrete 0.5×/1× buttons (`learn-dance-screen.tsx:180`), not a drag bar |
| Pro Tip overlay | 01 §2 | Data yes (`dancerTipVideoUrl` / `dancerTipImageUrl` on `DanceMove`); UI no |
| Like + total count | 01 §2 | **No**, at any layer. See §3.2 |
| Camera-permission pre-prompt copy | 01 §3 | Partly — `CameraPermissionOverlay` exists in `dance-flow` with its own copy; the exact strings in 01 §3 are not used |
| Silhouette | 01 §3, 02 | **No.** See §3.1 |
| "xx / 100" result + **Continue and Save your Score** | 02 §2 | **No.** The shared `DanceResultScreen` shows "Your result" / "Record again" / "Done" |
| Save My Video / Replace Video | 02 §4–5 | **No** |
| Learned move, saved score, Average Score | 02 §6, 03 §2 | **No** |
| ~~Catalog totals (`catalogMoveCount`, per style)~~ | 03 §2 | **Cut 2026-09-17** — not a gap; the profile has no denominator |
| ~~Move lookup for locally-stored ids~~ | 03 §2 | **Cut 2026-09-17** — not a gap; the snapshot in `LearnedMove` is what the profile reads |
| Download / Share a personal video | 03 §3 | **No.** `expo-media-library` and `expo-sharing` are not dependencies anywhere in the repo |
| Temporary cloud upload deleted after scoring | brief, `apps/edu/AGENTS.md` | Endpoint yes, caller no |

---

## 3. Where the documents and the built system disagree

These are the decisions that change what gets built. Each states the conflict, the
options, and this plan's recommendation. **Six need the product owner's answer** and are
repeated in §8; the rest are settled here.

### 3.1 "Silhouette" and "a valid scan" describe a flow that does not exist

Document 01 ends with "the user is in the camera view, with their full body inside the
silhouette, ready to scan", and 02 begins "the user is inside the silhouette and completes
a **valid** scan". Neither concept exists in `@bnewapp/dance-flow`: `RecordDanceScreen`
shows a picture-in-picture reference video and a beat-synced countdown, records for a
fixed duration, and always uploads. There is no body outline, no position check, and no
notion of a scan being invalid. The documents themselves say the scan-validity rules are
undefined (`README.md`, "Questions that the sources do not resolve").

Two separate questions hide inside one word:

- **Is the silhouette a guide or a gate?** A *guide* is a static overlay drawn over the
  camera preview — cheap, and a genuine usability win. A *gate* ("when their position is
  correct, continue") requires on-device pose detection: a new native model, a frame
  processor, a new failure mode, and a per-device performance budget. Nothing in the repo
  does pose detection today.
- **What makes a scan valid?** The only signal the server gives is `ScanStatus`
  (`packages/dance-core/src/types.ts:12`): `status`, `hasScore`, `score`,
  `isExternalScore`, `jobState`.

**Recommendation.** v1 ships the silhouette as a **guide only** — an overlay, no gate —
and defines a valid scan as a terminal poll with `hasScore === true`. That is
implementable today and testable. The gate is its own project with its own plan; do not
let it ride along inside a feature phase.

**This also exposes a product question the documents could not have known about.** When
the external scan server is unavailable, the worker writes a *random* fallback score in
50..70 (`packages/dance-core/src/scoring.ts:50`, used at
`apps/server/src/modules/dance/scan-worker.ts:115`) and flags it `isExternalScore: false`.
So `hasScore` can mean "nobody actually scored this dance". Under the recommendation
above, a fallback score becomes a learned move and enters Average Score. Refusing it is
worse UX — the user is shown a number and then told it does not count — but it does mean
the profile's headline metric can be partly synthetic. **Owner decision (§8).**

### 3.2 Likes contradict the brief

Document 01 requires a heart with **the total like count**, one like per user, persisted
across sessions. The brief allows exactly two server connections — the move catalog and
the scan score — and states there are no user IDs. A *total* is a server aggregate; it
cannot be computed on a device. And "one like per user" against a losable anonymous
session really means "one like per install, until the session is lost".

Options: (a) build server likes keyed by the anonymous uid — a new table, new endpoints, a
third server surface the brief excludes, and an unauthenticated-in-practice write path
with no abuse story; (b) a device-local heart with no count shown; (c) drop likes from v1.

**Recommendation: (c), with (b) as the cheap fallback.** Likes are the only requirement in
the whole document set that cannot be satisfied without contradicting the brief. **Owner
decision (§8).** This plan carries a phase for it, unscheduled, so the decision has a
home; nothing else depends on it.

### 3.3 There are two "temporary recordings", and the suggested privacy text is wrong

`apps/edu/AGENTS.md` already forbids one code path serving both, but the flow documents do
not separate them, and this bites the *user-facing copy*, not just the code:

| | Temporary cloud upload | Personal recording |
|---|---|---|
| Required? | Yes — the scan cannot score without it | No — the user chooses |
| Where | Supabase Storage, via the signed URL | Device only |
| Lifetime | Until the score is terminal, then deleted | Until the user deletes or replaces it |

Document 02 §7 proposes: *"A temporary recording stays on this device until you choose
whether to save it."* **That sentence is false for this implementation** — the clip is
uploaded before any score exists. Document 02 §7 also says, correctly, that the privacy
text must describe actual behavior. So the copy must be rewritten, for example: *"Your
dance is uploaded so it can be scored, then deleted from our servers. A copy stays on this
device until you choose whether to keep it."* **The final wording is an owner decision
(§8)** because it is a legal-facing string, but the rewrite is not optional.

### 3.4 The profile must survive a move leaving the catalog

Learned moves live on the device forever; the catalog does not. `getMove`
(`service.ts:278`) filters on `status = 'published'` **and** a non-null
`film_yourself_video_url`, and 404s otherwise. A learned move whose catalog row is later
unpublished would render as an error card, and the offline requirement in document 03 §6
("show cached learned moves and local videos") has the same shape.

**Decision: cache a minimal move snapshot locally at learn time** — `title`,
`thumbnailUrl`, `genreIds`, `level` — inside the `LearnedMove` record. The profile then renders
from local data alone and never depends on a fetch. **The snapshot is never refreshed** (S2 is
cut): it is written once at learn time and read forever, so an admin who later edits a published
move's title or artwork leaves the learned card showing what the user actually learned. That is
accepted, not overlooked. This is the same coerce-against-current-configuration
discipline `studio-core` uses for rooms, applied to a much smaller shape.

### 3.5 `catalogMoveCount` must use the feed's eligibility predicate

> **Moot since 2026-09-17.** `catalogMoveCount` is cut — the profile shows learned counts
> only, with no denominator, so nothing computes this number. Kept because the predicate
> argument still governs any future catalog-wide count. See
> `plans/educational-app-level-filter.md` §0.

Document 03 wants "45 of 800 moves learned" and per-style "learned / total". The counts
must be computed with **exactly** the predicate `listMoves` uses —
`.eq("status", "published").not("film_yourself_video_url", "is", null)`
(`service.ts:252`). A count over all `dance_moves` rows would include drafts and moves
with no reference video, which are unreachable from the feed, so progress could never
reach 100% and the denominator would move whenever an admin saved a draft. State the
predicate in the endpoint's test, not only in its implementation.

### 3.6 The level filter's options are not backed by an upper bound

Documents 01 and 03 assume levels 1, 2, 3. `dance_moves.level` is
`integer not null default 1` constrained only by `dance_moves_level_check check (level >= 1)`
(`supabase/migrations/20260825192507_create_dance_moves.sql:83`) — a floor, with **no upper
bound and no enumeration**. Hardcoding three buttons silently hides any move at level 4+.

**Decision (2026-09-17): hardcode the option list to levels 1, 2, 3, plus "All Levels".**
An earlier decision here made the list data-driven off a catalog-summary endpoint; that endpoint
is cut, so there is no enumeration to read. The risk above is real but bounded — a move at level
4+ stays reachable through "All Levels" and the style filter, so this costs discovery, not
content. `plans/educational-app-level-filter.md` §3 records the constant's home and the trigger
for revisiting it.

### 3.7 "Mixed order" is not free

Document 01 asks for moves "in a mixed order" by default. `listMoves` orders by
`(sort_order, created_at, id)` and its keyset cursor is built from those three columns. A
shuffled feed needs a stable per-session seed and a cursor that survives it; done naively
it duplicates and drops items across pages.

**Decision: v1 keeps the deterministic order.** Shuffle is separate, small work (seeded
ordering + the seed carried in the cursor) and is listed as an open decision, not smuggled
into the feed phase.

### 3.8 The feed's video field — reuse the chain the main app already ships

Document 01 says "a full-screen vertical video of a dancer" without naming a field. On
`DanceMove`, `mainVideoUrl`, `presentationVideoUrl`, `proDancerVideoUrl` and
`thumbnailUrl` are all nullable; **`filmYourselfVideoUrl` is the only non-null one**, and
only because eligibility guarantees it (`service.ts:56`). Any fallback chain must
therefore terminate at `filmYourselfVideoUrl` or the feed can render a blank card.

**Decision (2026-09-17): use `apps/mobile`'s existing chain verbatim.** This was written up as
an open question, which was an error — the repo had already answered it. `DanceMoveCard`
(`apps/mobile/src/features/dance/ui/dance-move-card.tsx:24-28`) resolves:

```ts
move.mainVideoUrl ?? move.proDancerVideoUrl ?? move.presentationVideoUrl ?? move.filmYourselfVideoUrl
```

Note the middle two are the reverse of what this section used to recommend, for no stated
reason. The shipped order wins. That card already terminates correctly and already does the job
Stepz's feed will do — preview a move, play the focused one through `useFocusedPlayback`, the
same hook F1 step 1 uses. Two apps reading one catalog should not render the same move
differently without a content reason; if the order is editorially wrong it is wrong in both
places, and fixing it is one content decision, not a per-app choice.

**The poster image needs the same chain, plus a branch the video chain does not.** The same
component resolves `move.thumbnailUrl ?? move.proDancerImageUrl ?? move.dancerTipImageUrl`
(`:29`). Unlike the video chain, **this one can still be `null`** — all three fields are
nullable and none is guaranteed by eligibility — so the card needs a third branch for a move
with neither a video nor an image. `DanceMoveCard` has it; Stepz's card needs it too.

**For F1:** a second consumer makes this genuinely shared rather than a premature abstraction.
Prefer one `resolvePreviewMedia(move)` in `packages/dance-core` — pure, DTO-only, no React — to
a second copy of both chains. Not a blocker: a copy that matches is still better than a
mismatch.

### 3.9 `userId` in the documents' data model

Documents 02 and 03 key `LearnedMove` and `PersonalRecording` on `(userId, moveId)`.
`docs/educational/README.md` already rules this out, and `apps/edu/AGENTS.md` repeats it:
key by `moveId` alone, because the anonymous session can be lost and replaced and local
data must survive that. Settled; no further discussion.

---

## 4. Target architecture

### 4.1 Feature layout

```text
apps/edu/src/features/
  feed/
    index.ts
    _atoms/{queries,ui}.ts      # moves infinite query, genres, catalog summary, filter state
    ui/{feed-screen,feed-item,filter-sheet,tempo-bar,pro-tip-overlay}.tsx
    api.ts
  scan/
    index.ts                    # the seam: RecordDanceScreen re-export + Stepz's own result surface
    _atoms/{mutations,ui}.ts    # score confirmation, video decision, temp-upload cleanup
    ui/{scan-result-screen,save-video-screen,replace-video-screen}.tsx
    recording-store.ts          # device file lifecycle for personal recordings
  profile/
    index.ts
    _atoms/{queries,ui}.ts      # learned moves, personal recordings, derived progress
    ui/{profile-screen,style-row,move-card,profile-move-screen,profile-style-screen}.tsx
    collection.ts               # PURE: learned-move + average-score rules
    __tests__/collection.test.ts
```

**`collection.ts` stays app-local and pure.** The learned-move and Average Score rules are
a Stepz concept: `apps/mobile` has no learned moves, no saved score and no local
collection. `packages/AGENTS.md` says to create a shared package only after a concept is
truly shared and to prefer feature-local code over premature abstraction, and
`dance-core`'s stated purpose is "film steps, countdown and timing, scoring, and
scan-status coercion" — not a profile. **Do not put it in `dance-core`.** Keep it a pure,
dependency-free module with its own unit tests, and promote it only if a second app ever
grows a collection.

### 4.2 Stepz owns its result screen; the package owns the flow

The shared `DanceResultScreen` renders fixed copy — "Your result", "Record again", "Done"
(`packages/dance-flow/src/ui/dance-result-screen.tsx:95`, `:107`, `:115`) — and offers no
slot for a score confirmation or a video decision. Stepz needs "**82 / 100**",
"**Continue and Save your Score**", and two follow-on decisions.

**Decision: Stepz writes its own result screen over the package's atoms.** Everything it
needs is already exported from `@bnewapp/dance-flow/atoms`, and `packages/AGENTS.md` says
`dance-flow` "owns the flow, not the dance product surface". Parameterising the shared
screen with labels and render slots for one app would make it a configuration surface for
two divergent products — the exact shape the R1–C1 refactor removed.

Consequence: `apps/edu/src/features/scan/index.ts` stops re-exporting `DanceResultScreen`
and exports Stepz's own. `RecordDanceScreen` is still re-exported and reused as-is.

### 4.3 Local data model

One MMKV store (`edu`), namespace `edu:v1:`, one record per move:

```ts
interface LearnedMove {
  moveId: string;
  savedScore: number;          // 0..100
  learnedAt: string;           // ISO
  updatedAt: string;           // ISO — changes on a confirmed score replacement
  move: {                      // §3.4 snapshot, refreshed opportunistically
    title: string;
    thumbnailUrl: string | null;
    genreIds: string[];
    level: number;
  };
}

interface PersonalRecording {
  moveId: string;              // at most one per move
  fileUri: string;             // permanent app-document path, never a cache path
  createdAt: string;
  durationS: number;
}
```

Persisted as records keyed by move id, not as two large blobs, so one write never rewrites
the whole collection. Every read coerces: an unknown shape, a score outside 0..100, or a
`fileUri` whose file no longer exists is dropped rather than trusted — the same
coerce-before-use rule the studio feature applies to snapshots.

**Average Score is derived, never stored:** `sum(savedScore) / count(learnedMoves)`, and
`--` when the count is 0 (03 §2). Storing it would let it drift from the records it
summarises.

### 4.4 Personal-recording file lifecycle

`RecordDanceScreen` hands back a **cache** path. The OS may reclaim it. So:

1. **Save My Video** → copy to the app document directory *first*, validate it is
   readable, then write the MMKV pointer, then delete the old file. A single MMKV key
   write is the "one complete, safe operation" document 02 §5 asks for; there is no second
   record to keep in step.
2. **Never delete the old file before the new pointer is written and the new file plays.**
   Document 02 §5 states this; the ordering above is what enforces it.
3. **Not Now** → delete the temporary local file; the learned move and score stay.
4. On startup, drop any `PersonalRecording` whose file is missing, and delete any file in
   the recordings directory with no pointer. Both directions, or the device leaks.

### 4.5 Temporary cloud upload retention

Two layers, because either alone is insufficient:

- **Client (F2).** Once the score poll is terminal and the score has been read, call
  `DELETE /api/dance/posts/:id`. It already removes the row and all three storage objects
  and is idempotent (`service.ts:436`).
- **Server (S3).** The client cannot be trusted to survive: kill the app between the score
  and the delete and the object is orphaned forever. A sweep is the backstop. The
  discriminator is available — Stepz users are exactly the **anonymous** ones
  (`apps/mobile` has no anonymous sign-in, as the FK comment in
  `20260916131240_allow_anonymous_users.sql` records), so "terminal `dance_posts` whose
  owner is anonymous and older than the TTL" selects Stepz posts and only Stepz posts.

### 4.6 Navigation

`/` (feed) → `/move/[moveId]/scan` → `/move/[moveId]/result`. The score and video
decisions are **states within the result screen**, not new routes: they are strictly
ordered, each gated on the previous one, and a route per step would make Back meaningless.

After the last decision, document 03 §2 requires Back from the profile to reach the feed.
So the exit is "dismiss the scan stack to the feed, then push the profile" — not a push
onto the scan stack. Verify on a device that Back from the profile lands on the feed and
not back inside the result screen; this is the kind of thing only a real build shows.

---

## 5. Phases

Execution order: **D1 and S1 first** (nothing else compiles without them), then
F1 → F2 → F3, with S3 any time after F2 and F4 unscheduled pending §3.2. One commit per
phase. Every phase ends with `corepack pnpm typecheck`, `test` and `lint` green; every
phase with visible behavior ends with a device run.

| Phase | Depends on | Summary |
|---|---|---|
| D1 — Local collection model | — | `collection.ts` (pure) + `_atoms` + MMKV records + coercion. No UI |
| S1 — Level filter | — | `level` filter on `GET /api/dance/moves`. ~~`GET /api/dance/catalog-summary`~~ **cut** — see `plans/educational-app-level-filter.md` |
| F1 — Feed | S1 | Vertical pager, filters, tempo bar, Pro Tip, CTA, permission entry |
| F2 — Scan seam | D1, F1 | Stepz result screen, score confirmation, video decision, upload cleanup |
| F3 — Profile & collection | D1, F2 | Overview, style rows, move detail, video actions, Scan Again |
| S3 — Retention backstop | F2 | Sweep terminal anonymous scan posts + their storage objects |
| F4 — Likes | §3.2 answer | **Unscheduled.** Only if the owner overrides the brief |

### D1 — Local collection model

Pure rules in `collection.ts`, records and atoms around them. No screen.

- `recordFirstScan(state, moveId, score, snapshot, now)` — creates the learned move and
  saves the first score. Idempotent: called twice for the same scan it must not duplicate
  or re-date.
- `saveConfirmedScore(state, moveId, score, now)` — **replacement, not best-of** (02 §2 is
  explicit). Only reachable from **Continue and Save your Score**.
- `averageScore(state)` — arithmetic mean, `null` (rendered `--`) at zero learned moves.
- `styleProgress(state, genreId)` and `learnedCount(state)`.
- Coercion of every persisted record on read (§4.3).

**Acceptance:** unit tests cover 02 §10's arithmetic verbatim — saved scores of 20 and 100
give 60% — plus: an unconfirmed repeat scan changes nothing; a confirmed one replaces even
when lower; a corrupt record is dropped without taking the collection with it; repeated
saves are idempotent.

### S1 — Level filter

One server change, no migration. **Superseded by `plans/educational-app-level-filter.md`;
build from there.**

1. **`level` filter.** Add `level: z.coerce.number().int().positive().optional()` to
   `DanceMovesQuery` (`apps/server/src/modules/dance/schemas.ts`), pass it through
   `listMoves`, apply `.eq("level", level)`. It must compose with `genre_id` and with the
   existing cursor — that combination needs its own test, because a filter that silently
   drops the cursor produces an infinite feed.
2. ~~**`GET /api/dance/catalog-summary`**~~ — **cut on 2026-09-17.** The brief allows two
   server connections (moves + scan) and the profile counts only what is on the device. Do
   not build it; see `plans/educational-app-level-filter.md` §0 for the full reasoning.

**Acceptance:** Vitest covering an invalid `level`, `level` + `genre_id` + cursor together, and
that the eligibility predicate still applies alongside the filter. Auth is already covered by
the existing catalog-reads case. No migration, no `db:push`.

### ~~S2 — Batch move lookup~~ *(cut)*

**Cut on 2026-09-17.** `GET /api/dance/moves/by-ids` would have refreshed the move snapshot
`LearnedMove` already holds. Do not build it; see the S2 bullet at the top of this file for the
reasoning and for what was accepted in exchange.

### F1 — Feed

The largest UI phase. Build it in this order, because each step de-risks the next:

1. Vertical pager over `atomWithInfiniteQuery` + the existing moves cursor, one
   full-screen item per move, `pagingEnabled`, playback bound to the focused item through
   `useFocusedPlayback` (`@bnewapp/mobile-kit/media/use-focused-playback`).
2. Filters: two buttons → bottom sheets. Level options from the hardcoded constant (§3.6), style
   options from `GET /api/dance/genres` in the agreed order (Hip Hop, Afro, Commercial,
   Party, Breaking, Ballet, Shuffle, K-pop). Both filters in one query key; a change resets
   the list to the top, visibly (01 §2: a reload must be clear to the user). No matches →
   **No moves found** + **Reset filters**.
3. Tempo bar: a vertical drag on the right, ≥⅓ of screen height, continuous update,
   `player.playbackRate`, reset to 1× on move change. `react-native-gesture-handler` is
   already a dependency; the pan must claim the gesture so the pager cannot also consume
   it (01 §5 makes this an acceptance criterion).
4. Pro Tip overlay, shown only when the move has `dancerTipVideoUrl` or
   `dancerTipImageUrl`; closing restores position, filters and speed.
5. Profile entry in the right-hand action column, outside the tempo bar's touch area.
6. **Dance this Move** → permission check → `/move/[moveId]/scan`, using 01 §3's exact
   pre-prompt strings.

Layout rules from 01 §2 (clear central area, no permanent boxes over the dancer) are
acceptance criteria, not suggestions.

**Acceptance:** 01 §5's checklist, each item a test or a named device check. Device run
required — the gesture conflict in (3) and the layout rules cannot be judged in jest.

### F2 — Scan seam

Stepz's own result surface (§4.2), then the two video screens.

1. Result: "**xx / 100**", Back (returns to the scan view, saved score untouched),
   **Continue and Save your Score** (disabled while saving; repeated taps must not double
   save), Retry on failure without leaving a half-applied replacement.
2. The first valid scan saves the score automatically (02 §2); a repeat scan shows the
   attempt and leaves the saved score and Average Score alone until confirmation.
3. Video decision, in the three states of 02 §3: no temporary recording → skip; recording
   and no saved video → **Save My Video**; recording and an existing saved video → **Do
   you want to replace your video?**. Exact strings from 02 §4 and §5.
4. File lifecycle per §4.4; cloud cleanup per §4.5.
5. Exit per §4.6.

**Acceptance:** 02 §10's checklist. Specifically tested: saving a score never touches a
video; the old video survives a failed replacement; the temporary cloud post is deleted
after a terminal score; a killed-and-relaunched app does not resurrect an unconfirmed
score. Device run required.

### F3 — Profile & collection

1. Overview: Average Score ring (numeric percentage always rendered, `--` at zero) and
   `learnedMoveCount` side by side, ~50/50 — "45 moves learned", **no denominator** (§3.5).
2. Style sections in the agreed order, each a horizontal row inside the vertical page,
   with learned counts from the local collection, ~3.5 cards visible, **See More** per style.
   Non-interactive empty placeholders, visually distinct from loading skeletons.
3. Move detail: official video, move name, saved score, **Scan Again**, and a **My Video**
   section only when a personal recording exists.
4. Personal-video actions: Play, Download, Share, Delete (confirmed). Download and Share
   need new dependencies — see the risk in §6.
5. Move data comes from the local snapshot alone (§3.4). There is no refresh path.

**Acceptance:** 03 §9's checklist, plus: the profile renders fully with the network off; a
learned move whose catalog row was unpublished still renders from its snapshot; returning
from detail restores scroll position. Device run required.

### S3 — Retention backstop

A sweep that deletes `dance_posts` in a terminal state, owned by an **anonymous** user,
older than a TTL, together with their storage objects — reusing the deletion path of
`service.ts:436` rather than a second implementation.

Decisions this phase must take rather than assume: where it runs (a worker beside
`startScanWorker` / `startMediaWorker` in `app.ts`, or a scheduled database job), the TTL,
and whether the anonymity test reads `auth.users.is_anonymous` in SQL or the
`is_anonymous` JWT claim at write time. **Prefer the SQL join:** a claim read at write time
cannot retroactively classify posts that already exist.

Settle abuse here too, since it is the same surface: an anonymous user can currently
create posts at the global rate limit (`RATE_LIMIT_MAX`, default 120/minute —
`apps/server/src/config.ts:9`), each one a video upload. A per-owner limit on
`POST /api/dance/posts` is the cheapest containment.

**Acceptance:** a terminal anonymous post past the TTL is removed with its objects; an
identified user's post is never touched at any age; a still-`uploading` post is never
touched; the sweep is idempotent and safe to run twice.

### F4 — Likes *(unscheduled)*

Only if §3.2 is decided against the brief. Scope if it happens: a `dance_move_likes` table
keyed by `(move_id, owner_id)` with RLS, a denormalised count, toggle + read endpoints,
per-owner rate limiting, and the feed's optimistic heart with rollback on failure (01 §4).
Do not start this without the written decision.

---

## 6. Risks

| Risk | Why it matters | Handling |
|---|---|---|
| The tempo bar and the pager fight for the vertical gesture | An acceptance criterion in 01 §5, and the failure is invisible in jest | Build step (3) of F1 immediately after step (1), on a device, before the rest of the feed |
| `expo-media-library` + `expo-sharing` are new dependencies | Download and Share (03 §3) need them; neither exists in this repo. They require a prebuild, new iOS usage strings and store privacy answers | Land them in **F3 only**, under `apps/edu/AGENTS.md`'s version-parity rule; they are edu-only, so no `apps/mobile` drift risk |
| The device fills with personal recordings | One per move across a large catalog, with no cap | §4.4's bidirectional startup reconciliation, plus a storage readout during F3's device check |
| A cache-path recording is reclaimed before the user decides | Silent "save" of a file that no longer exists | Copy-then-point (§4.4), and validate readability before writing the pointer |
| Average Score is partly synthetic | Fallback scores (§3.1) enter the headline metric | Owner decision; either way, store `isExternalScore` with the scan outcome so the decision stays reversible |
| Feed video field may be null | `mainVideoUrl` and its siblings are nullable | The fallback chain must terminate at `filmYourselfVideoUrl` (§3.8) |
| Orphaned cloud clips | A killed app leaves a video in Storage forever | S3 — and do not let F2 ship as the only cleanup |

---

## 7. Validation

Per phase, narrowest first:

```sh
corepack pnpm --filter @bnewapp/edu typecheck
corepack pnpm --filter @bnewapp/edu test
corepack pnpm --filter @bnewapp/server test
corepack pnpm typecheck && corepack pnpm test && corepack pnpm lint
```

`@bnewapp/admin`'s test task fails on a missing `apps/admin/.env.local` in this
environment; that is pre-existing and recorded under P0 in `plans/educational-app.md`.

Device verification is required for F1, F2 and F3 — the Android device that closed P0 is
sufficient. iOS remains unverified for this app (no Mac), so anything iOS-specific these
phases introduce — the photo-library permission in F3 above all — lands as **declared but
unexercised** and must be recorded as outstanding, exactly as P0 did. **The iOS bundle
identifier window is still open and closes at the first iOS build**; see "Known, and
deliberately not fixed here" in `plans/educational-app.md`.

---

## 8. Open decisions

Six were raised; **four still need the product owner.** Question 2 was settled by
`plans/educational-app-collection.md`, and question 5 by the precedent already shipped in
`apps/mobile`; both are kept here struck through so nobody reopens them.
The rest are settled above and listed only so nobody reopens them by accident.

| # | Question | Blocks | Recommendation |
|---|---|---|---|
| 1 | Is the silhouette a visual guide or a position gate? (§3.1) | F2's scope; a gate is a separate project | **Guide** in v1 |
| ~~2~~ | ~~Does a fallback (non-external) score create a learned move and enter Average Score? (§3.1)~~ | — | **Settled:** yes, and `isExternalScore` is stored so the call stays reversible (collection plan §2) |
| 3 | Likes: build against the brief, local-only, or drop? (§3.2) | F4 only | **Drop from v1** |
| 4 | Final privacy wording for the upload (§3.3) | F1's pre-scan copy | Rewrite required either way; the suggested text in 02 §7 is factually wrong here |
| ~~5~~ | ~~Which video field the feed plays? (§3.8)~~ | — | **Settled 2026-09-17:** reuse `apps/mobile`'s shipped chain verbatim, image fallback included (§3.8) |
| 6 | Shuffled default feed order? (§3.7) | Nothing in v1 | Deterministic in v1; seeded shuffle later if wanted |

Carried over from the documents, still unanswered there and **not** blocking:

- Final navigation after each video decision (03 §11). This plan uses My Profile, as the
  document set does.
- Whether styles with learned moves sort before the fixed style order (03 §11). v1 uses
  the fixed order.
- Move-name placement on the card (03 §11), and whether Delete Video uses a smaller
  button. Design calls; confirmation before deletion is required regardless.
- Temporary-file expiry time (02 §7). S3 picks a TTL; the documents define none.

---

## 9. Where this plan stops

At a Stepz that browses, scans, scores and remembers — the three surfaces of the brief. It
does not cover a second app's reuse of anything built here, the pose-detection gate, an
account system, or any analytics. If one of those becomes real, it gets its own plan, as
this one did.
