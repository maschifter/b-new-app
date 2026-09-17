# Stepz — Local Collection Model

Status: **planned, not started.** Written 2026-09-17 against `fcb37de`; every file and line
reference below was checked against the working tree.

**This file is the whole plan and it stands alone.** Every rule, stored shape, function
signature, decision and acceptance test needed to build and review this work is written out
here. It points at no other plan, and nothing outside this repository has to be opened to
execute it. `plans/educational-app.md` is the *completed* codebase plan that produced
`apps/edu`; it is history, not a dependency.

**Prerequisites: none.** No server change, no migration, no `db:push` approval, no device
run, no new dependency, no UI. Pure TypeScript plus MMKV-backed Jotai atoms under jest.

**Why this piece first.** `apps/edu` (Stepz) currently renders placeholders on every route.
Its scan flow will write learned moves and its profile will read them, so this model is the
shape both sides agree on. It is the cheapest thing in the app to get wrong late and the
cheapest to get right now — and it is the only piece that is unblocked today, because it
needs nothing from the server and nothing from a product decision (§2).

---

## 1. What Stepz stores, and why it is local

Stepz is a small dance app, separate from and simpler than BNewApp: a feed of catalog moves,
a learn-to-dance flow that scores a recording, and a profile holding what the user has
learned. **Everything the user accumulates lives on the device.** There are no accounts, no
user ids in the UI, and no analytics. The only server calls are reading the shared dance
catalog and obtaining a score.

### Vocabulary

| Term | Meaning |
|---|---|
| Move | A dance step in the shared catalog (`dance_moves`) |
| Learned move | A move for which the user completed a first valid scan. It stays in the collection even with no personal video |
| Saved score | The score currently stored for one learned move. Not necessarily the highest or the latest |
| Current attempt | The scan result being reviewed. During a repeat scan it does not change the saved score until the user saves it |
| Average Score | The arithmetic mean of all saved move scores |
| Personal recording | The user's optional, device-only saved video for a move |

### The rules this phase implements

| Object | Rule |
|---|---|
| `LearnedMove` | Unique by `moveId`. The first valid scan creates it; repeat scans must not duplicate it or re-date it |
| Saved score | The first valid scan saves its score automatically. A repeat scan replaces it **only** on the user's explicit **Continue and Save your Score** |
| `PersonalRecording` | At most one per `moveId`. Deleting it keeps the learned move and its saved score |
| Average Score | `sum(savedScore) / number of learned moves`, recalculated after the first save and after a confirmed replacement. An unconfirmed repeat-scan score never enters it |

```text
averageScore = sum(savedScore) / count(learned moves)
```

Saved scores of 20 and 100 give **60**. With no learned moves the value is `null`, which the
profile will render as `--`.

**This is a replacement rule, not a best-of rule.** A confirmed lower score replaces a higher
one. An unconfirmed attempt the user walks away from is discarded entirely.

**A valid scan** is one whose score poll reaches a terminal state carrying `hasScore === true`
(`ScanStatus`, `packages/dance-core/src/types.ts:12`). A terminal poll without a score, and a
poll that never terminates, are both real outcomes and neither creates a learned move: no
score, no record, no movement in Average Score. Those two surfaces belong to the scan screen,
which is not this phase; the rule they rest on is the one above.

---

## 2. Decisions, all settled — nothing here waits on an answer

**A fallback score does create a learned move, and does enter Average Score.** When the
external scan server cannot produce a score the worker writes a random integer in 50..70
(`generateFallbackScore`, `packages/dance-core/src/scoring.ts:58`, called at
`apps/server/src/modules/dance/scan-worker.ts:115`) and flags the result
`isExternalScore: false`.
So `hasScore === true` can mean "nobody actually scored this dance". Refusing such a score is
worse UX — the user is shown a number and then told it does not count — so it counts.
**`isExternalScore` is stored on the record** so the decision is reversible later by changing
one predicate, with no data migration.

**Records are keyed by `moveId` alone, never by a user id.** Stepz's anonymous Supabase
session exists only so the shared owner-scoped dance API can be reused unchanged; it can be
lost and replaced, and local data must survive that. This is already the app's persistence
contract (`apps/edu/src/lib/jotai/atom-with-mmkv.ts`, and `apps/edu/AGENTS.md`).

**Each record carries a catalog snapshot of its move.** `getMove`
(`apps/server/src/modules/dance/service.ts:278`) filters on `status = 'published'` and a
non-null `film_yourself_video_url` and 404s otherwise, so a learned move whose catalog row is
later unpublished would render as an error card. The snapshot means the profile never depends
on a fetch. `videoUrl` is in it because the move detail plays the official video and the other
snapshot fields carry none.

**Average Score is derived on read, never stored.** Storing it would let it drift from the
records it summarises. It is returned **unrounded**; rounding is a display decision and stays
in the screen, so it exists in one place and never reaches the stored records.

**`collection.ts` stays app-local and pure — do not put it in `@bnewapp/dance-core`.** Learned
moves, saved scores and Average Score are a Stepz concept: `apps/mobile` has none of them.
The root `AGENTS.md` says to create a shared package only after a concept is truly shared, and
`dance-core`'s stated purpose (`packages/AGENTS.md`) is film steps, countdown and timing,
scoring and scan-status coercion — not a profile. Promote it only if a second app ever grows a
collection.

---

## 3. Where the code goes

```text
apps/edu/src/lib/collection/
  types.ts        # LearnedMove, LearnedMoveSnapshot, PersonalRecording
  collection.ts   # pure rules — no storage, no React, no I/O
  coerce.ts       # entry-by-entry coercion of persisted JSON
  atoms.ts        # MMKV-backed state + derived reads + write-only actions
  index.ts        # the narrow public surface
  __tests__/collection.test.ts
  __tests__/coerce.test.ts
  __tests__/atoms.test.ts
```

**`lib/`, not a feature.** `apps/edu/AGENTS.md` scopes `lib/` to "api transport, auth,
bootstrap, persistence, router guards" — this is persistence, it renders nothing, and the scan
and profile features both consume it without either owning it. Putting it under one of them
would make the other import a screen feature to read its own data.

Consumers import `@/lib/collection` only. `types.ts`, `coerce.ts` and the raw storage atoms
are internal.

### 3.1 The stored records

One MMKV store (`edu`), namespace `edu:v1:`, written through `persistedEduAtom`
(`apps/edu/src/lib/jotai/atom-with-mmkv.ts`, which prepends the namespace — callers pass the
bare key). **Two keys, each holding one record map:** `learned-moves` and
`personal-recordings`.

```ts
export interface LearnedMoveSnapshot {
  title: string;
  thumbnailUrl: string | null;
  genreIds: string[];
  level: number;
  videoUrl: string;
}

export interface LearnedMove {
  moveId: string;
  savedScore: number;        // integer, 0..100
  isExternalScore: boolean;  // false for a fallback score (§2)
  learnedAt: string;         // ISO; set once, never re-dated
  updatedAt: string;         // ISO; changes only on a confirmed score replacement
  move: LearnedMoveSnapshot;
}

export interface PersonalRecording {
  moveId: string;      // at most one per move — the map key is the identity, so no `id`
  fileUri: string;     // permanent app-document path, never a cache path
  createdAt: string;   // ISO
  durationS: number;   // seconds; the unit is in the name deliberately
}
```

There is no combined `CollectionState`: the two maps are stored under separate keys and every
function in §3.2 takes exactly the one map it changes, so a wrapper shape would have no consumer.

`LearnedMoveSnapshot` is a projection of `DanceMove` (`packages/types/src/index.ts:208`);
`videoUrl` is whichever official video the scan resolved at learn time. **The caller resolves it
with a fallback chain ending at `filmYourselfVideoUrl`** — the one video field `DanceMove`
guarantees non-null (`packages/types/src/index.ts:221`). Every other one is nullable, and a
snapshot carrying an empty `videoUrl` is rejected on write (§3.2) and dropped on read (§3.3).

**One map under one key, not a key per move.** `persistedEduAtom` wraps `atomWithStorage` over
a single MMKV key (`packages/mobile-kit/src/jotai/atom-with-mmkv.ts`) and exposes no prefix
scan, so a key-per-move layout would need an enumeration path of its own outside the atom
layer — and every aggregate here needs the full set. One map instead makes each mutation a
single atomic MMKV write, with no separate index that can tear against the records it lists. A
few hundred learned moves is well under 200 KB of JSON.

**Four fields are deliberately absent.** No `userId` (§2); and on the recording no `id`,
`status` or `thumbnailUri` — the map key is the identity, a personal recording is never
uploaded so it has no upload lifecycle, and a poster frame is derived at render time rather
than stored. `duration` is `durationS` so the unit cannot be misread.

### 3.2 The pure rules — `collection.ts`

Every function is total and side-effect free and returns a new map; `now` is injected so tests
are deterministic.

```ts
recordFirstScan(
  moves: Record<string, LearnedMove>,
  input: {
    moveId: string;
    score: number;
    isExternalScore: boolean;
    snapshot: LearnedMoveSnapshot;
  },
  now: string,
): Record<string, LearnedMove>
```

Creates the learned move and saves its first score. **Idempotent:** if `moveId` is already
present the map is returned unchanged — no duplicate, no re-dated `learnedAt`, no overwritten
score. A `score` that is not a finite integer in 0..100, or a `snapshot` that §3.3 would reject,
also returns the map unchanged.

**The write path and the coercion in §3.3 enforce the same predicate, deliberately.** A record
the writer accepts but the reader drops is a learned move that disappears at the next launch —
exactly the loss §3.3 exists to prevent — so neither side may be the looser of the two.

```ts
saveConfirmedScore(
  moves: Record<string, LearnedMove>,
  moveId: string,
  score: number,
  isExternalScore: boolean,
  now: string,
): Record<string, LearnedMove>
```

**Replacement, not best-of** (§1). Sets `savedScore`, `isExternalScore` and `updatedAt`, and
leaves `learnedAt` and `move` alone. An absent `moveId`, or a score that is not a finite integer
in 0..100, returns the map unchanged — reaching either is a caller bug, not a user path.

```ts
averageScore(moves: Record<string, LearnedMove>): number | null
```

Arithmetic mean of `savedScore`, **unrounded**. `null` at zero learned moves.

```ts
learnedCount(moves: Record<string, LearnedMove>): number
learnedCountByGenre(moves: Record<string, LearnedMove>, genreId: string): number
```

`learnedCountByGenre` counts records whose `move.genreIds` contains `genreId`. It returns the
**numerator only**: the denominators — how many moves the catalog holds in total and per style
— are a server aggregate that does not exist yet, so nothing in this phase invents one.

```ts
savePersonalRecording(
  recordings: Record<string, PersonalRecording>,
  recording: PersonalRecording,
): Record<string, PersonalRecording>

deletePersonalRecording(
  recordings: Record<string, PersonalRecording>,
  moveId: string,
): Record<string, PersonalRecording>
```

Record bookkeeping only — at most one per move, replacing the entry when one exists. **Copying,
validating and deleting the file on disk is not this phase**; these functions never touch the
filesystem, and deleting a recording must not touch the learned move.

### 3.3 Coercion — `coerce.ts`

Persisted JSON is untrusted: it survives app upgrades and can be partially written.

```ts
coerceLearnedMoves(value: unknown): Record<string, LearnedMove>
coercePersonalRecordings(value: unknown): Record<string, PersonalRecording>
```

- A non-object, `null` or array input yields `{}`.
- **Entry by entry** — one malformed record is dropped and the rest of the map survives. Losing
  a whole collection to a single bad row is the failure this exists to prevent.
- A record whose `moveId` disagrees with its key is dropped.
- `savedScore`: a finite integer in 0..100. `isExternalScore`: a boolean; a missing value
  coerces to `true`. No stored record can predate the flag — this phase creates the key and the
  field together — so the default only ever meets a partially written record, and `true` keeps
  it counting, which is what §2 decides for every score.
- `learnedAt` / `updatedAt` / `createdAt`: non-empty strings that `Date.parse` accepts. A
  missing `updatedAt` falls back to `learnedAt`.
- `move`: `title` a string, `thumbnailUrl` a string or `null`, `genreIds` an array of strings
  (non-strings filtered out), `level` a finite integer `>= 1`, `videoUrl` a non-empty string.
- `durationS`: a finite number `> 0`. `fileUri`: a non-empty string.
- Unknown fields are dropped, not carried through.

### 3.4 State and actions — `atoms.ts`

```ts
const learnedMovesStorageAtom = persistedEduAtom<unknown>("learned-moves", {});
const personalRecordingsStorageAtom = persistedEduAtom<unknown>("personal-recordings", {});

export const learnedMovesAtom;               // read-only, coerced
export const personalRecordingsAtom;         // read-only, coerced
export const averageScoreAtom;               // number | null
export const learnedCountAtom;               // number
export const learnedCountByGenreAtomFamily;  // (genreId) => number, via jotai-family

export const recordFirstScanAtom;            // write-only action
export const saveConfirmedScoreAtom;         // write-only action
export const savePersonalRecordingAtom;      // write-only action
export const deletePersonalRecordingAtom;    // write-only action
```

- The storage atoms are typed `unknown` and never read directly: the exported read atoms are
  derived and coerce, so no consumer can see an unvalidated shape.
- Write-only action atoms coerce, apply the pure rule, and write the result back — one concern
  per atom, per `CLAUDE.md` §6. They take the payload and generate `now` themselves.
- Derived atoms only. Never a second copy of the state in a plain atom.

---

## 4. Acceptance

Unit tests under `apps/edu/src/lib/collection/__tests__/`, using the app's existing jest
harness (`apps/edu/jest.config.js`). The MMKV-backed atoms have a working precedent to follow
in `apps/edu/src/lib/jotai/__tests__/atom-with-mmkv.test.ts`.

**Pure rules**

- [ ] Saved scores of 20 and 100 give exactly `60` — §1's arithmetic verbatim.
- [ ] `averageScore` is `null` for an empty collection, and is **not** rounded: saved scores
      of 20 and 91 give exactly `55.5`, never `56`; 20, 90 and 92 give `202 / 3`, never `67`.
      Rounding is the screen's job, so an integer-only example cannot prove this rule.
- [ ] `recordFirstScan` called twice for the same `moveId` produces one record, with the
      original `learnedAt` and the original score.
- [ ] An unconfirmed repeat scan changes nothing — only `saveConfirmedScore` moves a score.
- [ ] `saveConfirmedScore` replaces a higher score with a lower one, bumps `updatedAt`, and
      leaves `learnedAt` and `move` untouched.
- [ ] `saveConfirmedScore` on an unknown `moveId` returns the map unchanged.
- [ ] `recordFirstScan` returns the map unchanged for a score outside 0..100 **and** for a
      non-integer score such as `55.5` — no partial record is created.
- [ ] `recordFirstScan` returns the map unchanged for a snapshot §3.3 would reject — an empty
      `videoUrl`, a `level` of 0 — so the writer never creates a record the reader drops.
- [ ] `saveConfirmedScore` with a score outside 0..100, or a non-integer score, leaves the
      existing `savedScore`, `isExternalScore` and `updatedAt` untouched.
- [ ] A fallback score (`isExternalScore: false`) creates a learned move and enters
      `averageScore`, and the flag round-trips through storage.
- [ ] `learnedCountByGenre` counts a move that belongs to two genres under **both**.
- [ ] `deletePersonalRecording` leaves the learned move and its saved score intact.
- [ ] `savePersonalRecording` twice for one move leaves exactly one recording.

**Coercion**

- [ ] A corrupt record is dropped and the rest of the collection survives.
- [ ] A record whose `moveId` disagrees with its key is dropped.
- [ ] A non-object, an array and `null` each yield `{}`.
- [ ] A record with no `isExternalScore` coerces to `true`.
- [ ] A `level` of 0, a `savedScore` of 101 and a missing `videoUrl` are each rejected.

**Atoms**

- [ ] A write survives a fresh atom read — the value round-trips through MMKV.
- [ ] `averageScoreAtom` updates after `recordFirstScanAtom` and after
      `saveConfirmedScoreAtom`.
- [ ] Corrupt JSON already in the store does not throw on read; it yields the coerced subset.

---

## 5. Validation

```sh
corepack pnpm exec turbo run typecheck --filter=@bnewapp/edu
corepack pnpm --filter @bnewapp/edu test
corepack pnpm lint
```

The typecheck goes through Turbo deliberately: `@bnewapp/types` resolves to source under Metro
but to `dist` for `tsc`, so a bare `--filter` typecheck fails on a clean tree until the
dependency is built (`apps/edu/AGENTS.md`, "Validation").

**No device run** — this phase renders nothing.

---

## 6. Explicitly not in this phase

Named so the diff stays reviewable and nobody grows the scope mid-sitting. Each needs its own
plan when it is next:

- **Any UI.** The feed, the profile, the move detail, the result screen. Every route in
  `apps/edu/src/app/` keeps its placeholder.
- **Any server change.** No `level` filter, no catalog totals, no batch move lookup, no
  retention sweep, no migration, no `db:push`.
- **The scan seam.** Nothing calls `recordFirstScanAtom` yet; the flow that will is the scan
  feature's work.
- **Snapshot refresh.** `move` is written at learn time and not refreshed here; refreshing it
  needs a batch catalog endpoint that does not exist.
- **The personal-recording file lifecycle.** Copying a clip out of the cache, validating that
  it is readable, deleting it, and reconciling records against the filesystem at startup. §3.2
  keeps the record bookkeeping pure precisely so that work can land separately.
- **Any change to `@bnewapp/mobile-kit` or `@bnewapp/dance-flow`.** Both are consumed as they
  are.
