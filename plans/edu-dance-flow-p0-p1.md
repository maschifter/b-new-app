# Plan: Stepz dance-flow P0/P1 parity with Boogiz

## Platform

Mobile — Expo / React Native. The primary target is `apps/edu` (Stepz); the recorder is
owned by the shared `@bnewapp/dance-flow` package and is also consumed by `apps/mobile`.

## Overview

Make the Stepz scan journey feel familiar to a Boogiz dancer without copying Boogiz's
purple skin or its rank/coin economy. The work finishes and validates the existing score
reveal (P0), then upgrades the shared camera experience (P0/P1): beat-aware count-in,
a record-state control with elapsed progress, deliberate camera switching, and safe
discard/retry handling. The sequence remains feed -> scan -> score -> local score/video
decision; no server contract or database change is needed.

## Assumptions

- Stepz is the intended meaning of "EDU". Its account-free, local collection model remains
  unchanged.
- "Familiar with Boogiz" means adopting the interaction rhythm (get-ready/countdown,
  active recording progress, scanning feedback, staged result reveal), not its branding,
  rewards, rank, or character UI. Stepz has no reward/rank API contract to display.
- The score reveal already present in `apps/edu/src/features/scan/ui/score-reveal.tsx` is
  the P0 baseline. It will be retained and verified rather than duplicated in
  `@bnewapp/dance-flow`.
- Scan polling currently exposes terminal status and score but no trustworthy server progress.
  The displayed scan progress must stay clearly an activity indicator capped below completion;
  it must never claim that a worker supplied an exact percentage.
- Recorder interaction improvements are shared, because `RecordDanceScreen` owns the camera,
  timing, reference PiP and lifecycle. They must preserve the existing mobile app's flow and
  use host theme tokens instead of Stepz-specific raw colours.
- Haptics are excluded unless product approves adding `expo-haptics` to both Expo apps at the
  same version. Visual/audio timing is sufficient for this increment.

## Affected Areas

- `apps/edu/src/features/scan/ui/score-reveal.tsx` — retain the Stepz-specific scan and
  scored reveal; refine copy/timing only where device verification finds a problem.
- `apps/edu/src/features/scan/ui/scan-result-screen.tsx` — keep Stepz's local-score and
  personal-video decision sequence connected to the reveal and failure fallback.
- `apps/edu/src/features/scan/ui/__tests__/` — cover reveal states, motion-reduction and
  result transitions with the Stepz collection semantics intact.
- `packages/dance-flow/src/ui/record-dance-screen.tsx` — compose new recording chrome into
  the existing camera/reference/countdown lifecycle.
- `packages/dance-flow/src/ui/recording-countdown.tsx` (new) — isolated, accessible,
  Reanimated count-in/get-ready overlay driven by the existing dance-core timing values.
- `packages/dance-flow/src/ui/recording-controls.tsx` (new) — presentational record button,
  elapsed/progress ring, camera switch and discard/confirmation controls.
- `packages/dance-flow/src/ui/__tests__/record-dance-screen.test.tsx` and new focused
  component tests — timing-state, actions, reduced-motion and accessibility coverage.
- `packages/dance-flow/package.json` — only if a new public subpath is genuinely required;
  screen-internal components should not be exported.

## Implementation Steps

### P0 — scanning and score reward moment

- [ ] Step 1: Turn the current `ScoreReveal` behaviour into an explicit acceptance matrix:
  upload starts at an indeterminate/0 visual state; scanning advances only to 95%; slow scans
  show reassurance; a terminal score triggers score/ray/approved decoration; actions appear
  after the reveal; reduced motion renders the same information immediately.

- [ ] Step 2: Refine `ScoreReveal` only where the matrix finds a gap. Preserve its current
  `useReducedMotion`, live-region milestones, safe-area scrim and Stepz palette. Keep progress
  synthetic-but-capped unless the API later supplies a real worker percentage.

- [ ] Step 3: Verify `ScanResultScreen` has exactly one owner for each terminal branch:
  scored attempts reveal then save the local score; upload/scan failures retain retry/back;
  terminal uploads are discarded; personal-video decisions happen only after score
  confirmation. Do not add Boogiz rank, coins, a social post, or a server reward endpoint.

- [ ] Step 4: Extend Stepz RNTL tests for upload, normal/slow scan, pass and below-threshold
  score, reduced-motion score reveal, delayed action visibility, retry, and the existing
  save/skip personal-video branches. Assert accessibility labels/live announcements rather
  than animation implementation details.

### P0/P1 — count-in and recording feedback

- [ ] Step 5: Extract a `RecordingCountdown` component in `packages/dance-flow`. It consumes
  the existing `FilmStep`, `countdownPhases`, `countdownCompletionMs`, BPM and music delay
  values; it must not create a second timer or alter the recording start instant. Animate
  `Get ready` then `3`, `2`, `1`, `Dance` with scale/fade on the UI thread; render stable text
  without animation when Reduce Motion is enabled; announce the labels accessibly.

- [ ] Step 6: Replace the recorder's static text countdown with that component while retaining
  its timer cleanup, permission states, silhouette visibility and audio-offset measurement.
  Confirm the visual `Dance` boundary and the actual `beginRecording` callback remain aligned
  to the existing half-countdown timing contract.

- [ ] Step 7: Add a `RecordingControls` component in `packages/dance-flow` and render it over
  the camera scrim. In `READY`, present one dominant circular record affordance and contextual
  duration. In `RECORDING`, replace it with a stop affordance plus elapsed/remaining progress
  derived from the already-known recording length. Do not add a second clock that can outlive
  the recorder; stop/reset it from `FilmStep` transitions.

- [ ] Step 8: Promote production camera selection from the current development-only toggle:
  keep the initial front camera, add an accessible flip-camera action in `READY`, disable it
  during the count-in/recording, and reset safely when a Vision Camera session fails. Keep
  `Flip PiP` as a separate reference-layout action so the two meanings cannot be confused.

- [ ] Step 9: Add intentional exit handling. From `READY`, Back returns normally. From a
  count-in or active take, Back/Discard opens an accessible confirmation with Continue,
  Restart take, and Leave scan. Each branch clears timers, pauses audio/reference playback,
  cancels an active recorder where applicable, and never navigates with a partial clip.

- [ ] Step 10: Preserve the existing automatic stop at the reference duration. At completion,
  transition directly to the current result route; do not insert a general preview/upload
  gate, because Stepz's result route already owns score confirmation and its optional
  device-only personal-recording decision.

### Verification and rollout

- [ ] Step 11: Update dance-flow tests with fake timers for exact countdown labels, start/stop
  state, auto-stop, discard cleanup, camera flip availability, PiP independence, and reduced
  motion. Keep the existing permission, simulated recording and audio-offset cases green.

- [ ] Step 12: Run `corepack pnpm exec turbo run typecheck --filter=@bnewapp/edu` and
  `corepack pnpm exec turbo run typecheck --filter=@bnewapp/dance-flow`, then the two focused
  Jest suites and root Biome lint.

- [ ] Step 13: Device-verify Stepz on iOS and Android: camera permission, first record,
  countdown sync against audio/reference, manual stop, auto-stop, flip camera, discard,
  normal/slow scan, pass/fail reveal and Reduce Motion. Capture before/after recordings or
  screenshots for the visible P0/P1 change.

## Out of Scope

- Boogiz visual assets, mascot/tooltips, purple theme, rank, coins, battle mechanics and
  social publishing.
- Database migrations, scoring-worker changes, progress API changes and reward APIs.
- Replacing Stepz's feed, filters, TempoBar, collection/profile flow or temporary-upload policy.
- Installing a haptics package or changing native generated projects.

## Open Questions

- Is the 70/100 `APPROVED` threshold the intended Stepz success criterion, or should it come
  from server/admin-configured move data later?
- Should `Restart take` remain inside the recorder (recommended) or navigate back to the feed?
- Is a future, explicitly labelled real scan-progress field worth adding to the server API?
