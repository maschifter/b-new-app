# Stepz (apps/edu) — Boogiz Design Alignment

Status: **reviewed eight times; ready to implement.**
Written 2026-09-18 against `35c5ac6` and revised seven times the same day. The second
pass re-read the source on both sides and corrected §2, §3, §4.3, §5, §6, §7, §8.1,
§8.2, §8.3, §8.4, §9 and §10. The third pass re-verified every claim against both trees
and corrected §1.2, §1.3, §2, §5.1, §5.5, §7.3d, §8.2, §8.4, §9 and §10.

The **fourth pass re-counted every figure and re-ran every citation**, and its three
substantive fixes are the ones that change the work:

1. **§10's "one existing assertion changes" was wrong.** The 1200 ms action gate breaks
   eighteen call sites in `scan-result-screen.test.tsx`, not one, because that
   file runs on real timers and RNTL's `findBy*` gives up at 1000 ms. §8.2 now reaches
   those controls through the reduced-motion branch instead — **not** through an injected
   delay, which it refuses by name — and §10 names every site.
2. **§8.1 contradicted the seam §3 builds on.** It moved the scanning copy into an
   app-owned component while `submission-feedback.tsx:9-13` states that copy is the
   package's. §6 now adds a `renderScanning` slot, symmetric with `renderScored`.
3. **`ScoreReveal` had no prop contract** though §10 specifies tests against it. §8.4
   now declares it.

Smaller corrections in that pass: the celebration gradient's transparent stop (§8.2),
the `StyleSheet` rule count in §7.3d, the `average-score-ring` test's existing coverage
(§10), the assertion count in §8.2, and the `FilterButton` line number in §7.3a.

The **fifth pass re-ran every count and citation against both trees a final time**. The
fourth pass's own claim to have done so did not hold: three figures were off and two
sections disagreed with each other. What changed:

1. **§7.3a and §9 gave `feed-filter-sheet.tsx:60`/`:63` two different colours.** §7.3a
   moved the selected row to `primary-wash` + `accent`; §9 listed those exact lines as
   `neon`'s job. §7.3a now defers to §9 and the row keeps `neon`.
2. **The `accent` neutral defaults collided with `neon`.** `#A1A1AA` in `mobile-kit` *is*
   that file's `neon`, and the proposed `#A78BFA` for `apps/mobile` *is* that app's — so
   §10's Phase 0 device check could not have observed anything. §4.1 now gives both a
   distinct value and §10 names the one surface mobile renders `accent` on.
3. **Reduced motion had no named API and no precedent.** Nothing in `apps/` or
   `packages/` reads a motion preference today, yet §8.5 and the whole eighteen-site test
   fix depend on one. §8.5 now names `useReducedMotion()` and gates Phase 4 on proving it
   mockable first.

Corrected counts in that pass: the `{score} / 100` assertions are **twenty-one**, not
twenty-two; `confirmScore()` has **12** callers, not 13, so the gate touches **eighteen**
call sites, not "roughly seventeen"; `Couldn't save your score` is asserted at `:415`, not
`:414`. Also corrected: `YellowButton` is a stretched `Image`, not a 9-slice (§1.3),
`ScoreCalculationProgress.tsx` sits outside the `learnskill/` folder §8 ports from (§8.1),
and the header itself claimed §8.2 "makes the gate injectable" while §8.2 forbids exactly
that.

The **sixth pass re-verified every citation against both trees once more**, this time
including the ones the fifth pass had introduced. Every line number, every count and
every Boogiz value held — the `{score} / 100` assertions are twenty-one, `confirmScore()`
is declared at `:172` with exactly the 12 callers §10 lists, `average-score-ring.tsx` has
eight `StyleSheet` rules of which exactly two are size-independent, `expo-font@55.0.8` is
what the lockfile resolves, and `dance-result-screen.tsx:66` passes no `renderScored`.
Five things still needed fixing, one of them a real contradiction:

1. **§9 point 3 contradicted §6, §9 point 4 and §4.1.** It said `apps/mobile` gains pill
   radius "and nothing else visible" while three other sections move the shared fallback
   scored line to `text-accent` — and §4.1's Phase 0 device check *depends* on that line
   being mobile's one rendered `accent` surface. §9.3 now states both changes.
2. **§1.3's radius list was not the frequency ranking it claimed to be.** `4` (26×) and
   `6` (19×) both outrank the listed `24` (13×) and were missing. §1.3 now gives the full
   list and says why the two hairline values do not change the shape rule.
3. **§2's "12 distinct token classes" undercounted.** The real figure is 14: `border-neon`
   — which the bullet directly above it names — and `border-white` were both omitted.
4. **§8.1's progress thresholds were ambiguous.** "Every 800 ms below 75" can be read as
   `< 75`, which would swallow the 500 ms band. Now stated as explicit ranges matching
   `ScoreCalculationProgress.tsx`'s own branch order.
5. **§8.4 never said who renders `ScoreActions` in the `failed` row.** `ScorePanel`'s
   `isTerminal` is `scored || failed`, so extracting the fragment for the scored reveal
   silently removes it from the failed state unless it is mounted back. Now stated, with
   the reason `:387` needs no reduced-motion `beforeEach`.

One thing the sixth pass checked and left alone: §6's `text-neon` → `text-accent` change
breaks no test in `packages/dance-flow`. Both `submission-feedback.test.tsx` and
`dance-result-screen.test.tsx` assert the string `You scored <n> points!` and never the
class, so §10's validation list needs no new entry for it.

The **seventh pass validated the reduced-motion test seam**, which the sixth pass had
incorrectly left as a thing to discover during implementation. The shared Jest setup
keeps Reanimated's JS layer real and mocks only `react-native-worklets`
(`packages/mobile-kit/testing/jest/setup.js:7-13`); its package-provided mock, when a
suite explicitly uses it, omits `useReducedMotion`
(`node_modules/react-native-reanimated/lib/module/mock.js:46`). The real hook also
snapshots the system preference at module load and never re-renders when the setting
changes (`src/hook/useReducedMotion.ts:4-17`), so a device preference cannot be flipped
from a suite's `beforeEach`. §8.5 now specifies the local, mutable Jest mock that makes
the branch testable without adding a production delay prop or changing the shared Jest
harness.

The **eighth pass resolved the final plan-review findings**: §4.3 now keeps both
APPROVED-ribbon-only colours out of components and out of Tailwind; §5 forbids combining
Slackey's single regular face with the old bold weights; §8.5 defines bounded, cross-platform
progress announcements instead of assuming changing an accessibility label is announced; and
§10's `confirmScore()` citation is corrected to `:172`.

Every Boogiz reference below was read out of
`/Users/kb/Documents/works/magnus/boogiz/boogiz-rn` and every bnew reference out of this
working tree, and every line citation and count in it was re-checked against the files
named.

Owner decisions taken before writing (2026-09-18):

1. **Adopt the Boogiz palette and display font literally.** Stepz's current pink
   direction is replaced, not blended.
2. **Derive the spec from `boogiz-rn` source.** No Figma, no screenshots.
3. **Scope = visual pass + an animated score reveal.** No tooltip system, no
   hand-pointer onboarding.
4. **A custom display font is in scope**, with the `expo-font` dependency it needs.

The flow itself does not change: the same screens, the same routes, the same state.
Only how they look.

---

## 1. The Boogiz style, measured

### 1.1 Palette — `boogiz-rn/src/utils/theme.ts`

| Role | Boogiz value | Where it is used |
| --- | --- | --- |
| Primary | `#AE3EF6` (`appColors.primary`) | CTA fills, active chrome, `AppButton` `btnStyle="purple"` |
| Primary wash | `rgba(214,158,250,0.2)` / `0.12` / `0.5` | selected states, card tints |
| Accent | `#F9CF54` (`mainYellow` / `yellowx1`) | **every score, every ring, every coin** |
| Accent wash | `rgba(249,207,84,0.2)` / `0.3` | badges behind accent text |
| Surface | `#1C141F` (`bastille`) | screen ground |
| Copy | `#E8E8E9` (`iron`), `rgba(255,255,255,0.6)` | body, secondary |
| Error | `#F94229` | failures |
| Success | `rgba(52,199,89,1)` | confirmations |
| Celebration scrim | `rgba(71,34,108,1)` | the post-score bottom gradient |

The single strongest signal is the **purple/yellow pair**: purple carries action,
yellow carries achievement. Stepz currently has no accent at all, which is why it
reads flat next to Boogiz regardless of hue.

### 1.2 Typography — `boogiz-rn/src/utils/theme.ts`, `src/assets/fonts/`

- Display face: **`Slackey-Regular.ttf`** (SIL OFL, Google Fonts). It appears 96 times
  across 54 Boogiz source files, overwhelmingly for emphasis: buttons (`YellowButton`,
  `GreenButton`, `UnLockChestButton`), coin and reward counts, battle-pass headings and
  modal titles. Stepz adopts the same role, not the same frequency: never body copy.
- Scale: `header 36 / title 22 / subtitle 16 / body 14 / footnote 12`.
- Weights: `400 / 500 / 700 / 800`.
- The other six faces shipped in Boogiz are **out of scope**, and not because they are
  incidental — each carries a product surface Stepz does not have. `SpicyRice` (16 files)
  is the battle-pass face, `Coiny` (6) the league face, `FasterOne` (4) the streak face;
  `VT323`, `Jua` and `Staatliches` (2 files each) sit on a party screen, the tab bar and
  one Film popup. Adopting any of them would mean inventing the surface it names.

### 1.3 Shape and motion

- Radii, counted from `r={…}` across `.tsx`: `8` (69×), `16` (45×), `12` (34×),
  `99`/`100` (29×), `4` (26×), `6` (19×), `24` (13×). **This is the full list, not a
  top-five**; an earlier draft dropped `4` and `6` while keeping the rarer `24`, which
  made it read as a frequency ranking it was not. `4` and `6` are hairline insets —
  `GradientStrokeWrapper`'s own `borderRadius: 6` is one of them — not a shape decision,
  which is why the rule below ignores them. Pills for actions, `16` for cards, `8`/`12`
  for chips.
- Press feedback is a spring scale-down: `BounceablePress` (`withSpring`, `scaleIn`
  default `0.9`). Stepz already ships the same component as `BouncablePress`, at `scaleIn`
  `0.96` — a visibly gentler press. **Keep `0.96`**; matching `0.9` is not part of this
  pass. Boogiz's other bounce, `useBounceEffect` (default output `[0.95, 1]`, `withTiming`
  + `withRepeat`), is an idle attention pulse rather than press feedback, and is out of
  scope with the tooltip system it decorates.
- Gradient borders via `GradientStrokeWrapper`
  (`boogiz-rn/src/components/GradientStrokeView.tsx`): a `LinearGradient` with
  `padding: 2.5`, `borderRadius: 6`, child inset on top.
- The primary CTA (`YellowButton`) is a **stretched raster** (`yellow_btn_bg`, a plain
  `Image` at `resizeMode: "stretch"` with no `capInsets`, so it distorts rather than
  nine-slicing) with
  Slackey `24/34` white, `paddingHorizontal 35`, `paddingVertical 8`.
  **Decision: reproduce every Boogiz raster in RN primitives, never copy the file.**
  A stretched PNG is worse than a gradient in RN, and Boogiz's art is that product's
  asset, not a palette or a font. Reproduce faithfully — the ruling is about the
  medium, not the design. §8.2 gives the three reproductions the score reveal needs.

---

## 2. What Stepz has today

- `apps/edu/theme/colors.js` — 11 token values, pink `#FF2E88` primary, no accent.
- `apps/edu` owns ~2.0 k lines of UI: `features/feed` (5 files, 742 lines),
  `features/profile` (9 files, 805 lines), `features/scan` (3 files, 499 lines).
- Shared UI it renders is small and already token-driven:
  - `@bnewapp/mobile-kit/ui` — `BouncablePress`, `DanceSkeleton`,
    `MobileQueryErrorBoundary`. `MediaScrimPanel` and `TempoBar` are rendered too but come
    from their own entries (`ui/media-scrim`, `ui/tempo-bar`), which is why the `ui`
    barrel exports only those three.
  - `@bnewapp/mobile-kit/ui/dev-menu` — `DevMenu`, which `apps/edu/src/app/_layout.tsx`
    mounts behind `__DEV__` through a thin `@/features/dev-menu/dev-menu` wrapper. It is
    easy to miss and it ships the third shared `text-neon` (its DEV badge,
    `dev-menu.tsx:91`) plus a `border-neon` FAB (`:89`), so it re-tints with §9's
    decision.
  - `@bnewapp/dance-flow` — `record-dance-screen.tsx` (534 lines, the only heavy one),
    `submission-feedback.tsx` (55), `camera-permission-overlay.tsx`,
    `camera-unavailable-overlay.tsx`, `dance-silhouette.tsx`.
    `dance-result-screen.tsx` is **mobile's only** — Stepz has its own
    `scan-result-screen.tsx`.
- Across both shared packages the entire colour surface is 14 distinct token classes
  (`text-foreground` ×20, `text-muted` ×8, `bg-panel` ×7, `border-border` ×7,
  `bg-primary` ×6, `bg-panel-raised` ×4, `text-neon` ×3, `text-copy` ×3, `bg-app` ×3,
  `text-danger` ×2, `border-neon` ×1, plus `bg-black` ×7 / `bg-white` ×1 and
  `border-white` ×1 for video chrome, which is the documented exception). An earlier
  draft said 12 and omitted `border-neon` and `border-white` — the first of which the
  bullet above names in the same breath and §9 lists as a re-tint site, so the count
  contradicted its own surrounding text.

**The seam already exists and points the right way.** `packages/mobile-kit/theme/`
owns token *names*; each app owns token *values*. Widening it changes those small
contract files in both apps, but does not introduce a Boogiz product dependency into a
shared package.

---

## 3. Architecture decision — the answer to "style now or later?"

> Should we design the styling seam now, given `apps/mobile`'s own design is undecided
> and components are shared?

**Extend the existing seam now; do not build a theme runtime.**

Rationale:

- The colour seam is proven and costs nothing to widen. What it does not yet cover is
  **one accent colour** — one token name in `mobile-kit` and values in the two apps.
  `apps/mobile` keeps a neutral accent value; any visible shared-screen change is
  explicit in §6 and must be verified on Android. The display font is not a shared
  token: no shared component uses it, so Stepz declares it locally in §5. That keeps an
  app-specific native font out of BNewApp's undecided design system.
- A `ThemeProvider`, a runtime palette registry, or a `theme="boogiz" | "bnew"` prop
  inside packages is YAGNI and actively harmful: it makes package code name products,
  and it rots the day bnew's design is decided.
- Where a shared component must differ **structurally**, not just chromatically, use
  **slot injection**, for which this repo already has the precedent:
  `SubmissionFeedback` takes `renderScored` so each app states a score its own way
  (`packages/dance-flow/src/ui/submission-feedback.tsx:14`). Any further divergence on
  the record screen takes the same shape.

**The invariant that keeps this safe:** *a package may write token names only; every
Boogiz-specific value lives in `apps/edu/theme/colors.js`.* Raw hex in a package is a
defect, with the single documented exception of chrome laid over video, which stays
black/white so it survives an arbitrary frame.

**Gradients are runtime values, not classes.** NativeWind cannot express a RN
`LinearGradient`, so gradient stops cannot be tokens. Rule: brand gradients live in
**app-owned** screens, reading `RUNTIME_COLORS` from `@/lib/theme/colors` — a separate
export from `COLORS` precisely so Tailwind never turns a gradient stop into a class
(§4.3). A shared component that needs one takes it as a prop. `MediaScrimPanel` stays as it is — its scrim is neutral black by
design.

---

## 4. Phase 0 — widen the token contract

Files: `packages/mobile-kit/theme/colors.js`, `colors.d.ts`; both apps'
`theme/colors.js` and `colors.d.ts`. The existing Tailwind configs import their full
app palette, so adding this colour needs no Tailwind-config edit.

### 4.1 One new colour token

```js
// packages/mobile-kit/theme/colors.js — neutral default, as every token here is
accent: "#B4B4BD",
```

Deliberately **not** `#A1A1AA`, which is this file's `neon`. Two token names sharing one
value make a mistinted component invisible to review: `text-accent` and `text-neon` would
render identically in the app that forgot to override them, which is the single case these
neutral defaults exist to make obvious.

`accent` is the achievement colour. It is the token the score, the ring and any
celebration badge resolve against. Nothing else earns a new name: Stepz's washes and
the celebration scrim are runtime values kept out of the token object entirely (§4.3),
and radii already map onto Tailwind's defaults (`rounded-lg` 8, `rounded-xl` 12,
`rounded-2xl` 16, `rounded-full`).

`apps/mobile/theme/colors.js` takes `accent: "#C4B5FD"` — a lighter step of its existing
`neon` (`#A78BFA`), not a copy of it. An earlier draft of this plan reused `neon`'s value
verbatim, which made §10's Phase 0 device check unfalsifiable: with the two tokens equal,
nothing on screen can show whether `accent` resolved at all. Mobile still gains no new
visible colour of its own — the value is neutral within its existing palette — but a
mistint is now visible. Mobile renders `accent` in exactly one place today, the shared
fallback scored line (§6), so that line is what the Phase 0 check looks at.

### 4.2 Deliberately not added

- A named font-size scale (`display/title/subtitle/body/footnote`). Boogiz's 36/22/16/
  14/12 maps onto `text-4xl`/`text-[22px]`/`text-base`/`text-sm`/`text-xs` closely
  enough, and every added name is a name both apps must keep forever.
- A shared `font-display` token. It belongs only to Stepz until a second app uses a
  display face; §5 adds it in `apps/edu/tailwind.config.js`.
- Radius tokens. See §4.1.
- Shadow tokens. Boogiz's depth comes from gradients, not shadows.

### 4.3 Stepz's palette (`apps/edu/theme/colors.js`)

Derived in §1.1, **approved by the owner on 2026-09-18**.

| Token | New | Was | Source |
| --- | --- | --- | --- |
| `app` | `#1C141F` | `#0B0B10` | `bastille` |
| `panel` | `#261B2B` | `#141420` | bastille lifted |
| `panel-raised` | `#332439` | `#1D1D2E` | bastille lifted ×2 |
| `panel-muted` | `#3F2D47` | `#26263C` | bastille lifted ×3 |
| `foreground` | `#FFFFFF` | `#FFFFFF` | unchanged |
| `muted` | `#9A8CA3` | `#8A8AA3` | `white60` on bastille |
| `copy` | `#E8E8E9` | `#D3D3E4` | `iron` |
| `border` | `#4A3B52` | `#33334D` | `white20` on bastille |
| `neon` | `#D69EFA` | `#FF4D9D` | `primary2` base |
| `primary` | `#AE3EF6` | `#FF2E88` | `appColors.primary` |
| `accent` | `#F9CF54` | — | `mainYellow` |
| `danger` | `#F94229` | `#FF6B6B` | `appColors.error` |

Eight further values live in the same file but in a **second, separate export**,
`RUNTIME_COLORS` — gradients, washes and native drawing colours, not Tailwind tokens:

```js
const RUNTIME_COLORS = {
  "accent-wash": "rgba(249, 207, 84, 0.2)",
  "primary-wash": "rgba(214, 158, 250, 0.12)",
  "score-track-scanning": "rgba(255, 255, 255, 0.2)",
  "score-track-scored": "rgba(255, 255, 255, 0.4)",
  celebrate: "#47226C", // the post-score bottom gradient's solid end
  // Its transparent end. Zero-alpha *purple*, never the `transparent` keyword, which is
  // zero-alpha black and fades through grey on Android (§8.2).
  "celebrate-fade": "rgba(71, 34, 108, 0)",
  // The APPROVED ribbon uses `COLORS.accent` as its base. These are its white top-edge
  // overlay and its raster-derived label colour; they are runtime values, not utilities.
  "approved-ribbon-highlight": "rgba(255, 255, 255, 0.25)",
  "approved-ribbon-copy": "#7A5B12",
};

module.exports = { COLORS, RUNTIME_COLORS };
```

**They must not go inside `COLORS`.** `apps/edu/tailwind.config.js` does
`theme: { extend: { colors: COLORS } }`, so every key of that object becomes a real
utility class: an `accent-wash` sitting in `COLORS` would make `bg-accent-wash` compile,
and "never write that class" would be a rule nothing enforces. A separate export makes
it unrepresentable instead of merely discouraged. `apps/edu/src/lib/theme/colors.ts`
re-exports both (`export { COLORS, RUNTIME_COLORS } from "../../../theme/colors";`), and
components read washes and gradient stops from `RUNTIME_COLORS`.

`ScoreRing` receives these track values through its `trackColor` prop; it must not
introduce a raw `rgba(...)` value in a component.

`apps/mobile` gains no `RUNTIME_COLORS` — only `COLORS.accent`. `colors.d.ts` in each
app is updated to match (Stepz's declaring both exports);
`packages/mobile-kit/theme/colors.d.ts` gains only `accent`.

---

## 5. Phase 1 — typography

1. Add `expo-font` to `apps/edu` only, as **`~55.0.8`** — the tilde form most of
   `apps/edu`'s `expo-*` dependencies use (`expo`, `expo-constants`, `expo-router` and
   `expo-status-bar` are pinned exactly; every other one takes a tilde), at the version the
   lockfile resolves today (`expo-font@55.0.8`, pulled in transitively by
   `@expo/vector-icons` and `@expo/router-server`). The `^55.0.8` that appears in
   `pnpm-lock.yaml` is `@expo/router-server`'s *peer* range, not a resolved importer
   range; do not copy it. Precedent: `expo-media-library` and
   `expo-sharing` are Stepz-only (`plans/educational-app-profile.md` §F3b). The
   identical-range rule in `apps/edu/AGENTS.md` binds **shared** dependencies; this is
   not one yet. When `apps/mobile` later wants a display face, both must be pinned to
   one range at that point.
2. Add `apps/edu/assets/fonts/Slackey-Regular.ttf` and the upstream Slackey `OFL.txt`
   beside it. Record the upstream Google Fonts source and asset SHA-256 in
   `apps/edu/assets/fonts/README.md`. Boogiz is the visual reference, but its font
   directory has no adjacent licence text; do not treat copying its binary alone as
   sufficient licence provenance.
3. Extend `ExpoAppConfigOptions` in `packages/mobile-kit/expo/app-config.d.ts` and
   `createExpoAppConfig` in `packages/mobile-kit/expo/app-config.js` with optional
   `plugins?: ExpoPlugin[]`. Define and export that type in the declaration file as
   `type ExpoPlugin = NonNullable<ExpoConfig["plugins"]>[number]`; the existing JSDoc
   alias is not visible to TypeScript consumers. Append `...(plugins ?? [])` after the
   shared plugins. Pass
   `plugins: [["expo-font", { fonts: ["./assets/fonts/Slackey-Regular.ttf"] }]]` from
   `apps/edu/app.config.ts`. The helper currently owns and overwrites the complete
   plugin list, so merely editing the app config cannot register the font. A config
   plugin embeds the face at build time, so the root layout needs no font gate.
4. `apps/edu/tailwind.config.js`: `fontFamily: { display: ["Slackey-Regular"] }`. The two
   platforms resolve that string differently — Android matches the embedded file's base
   name, iOS the face's PostScript name — and `Slackey-Regular.ttf` happens to satisfy
   both. That coincidence is exactly what Phase 4's "no screen falls back" device check is
   for; if iOS falls back, the fix is the family name `Slackey`, not a second asset.
5. Apply `font-display` to emphasis only, matching Boogiz's own restraint: primary CTA
   labels, screen titles, the celebration heading, the level/style chips' active label, and
   the saved score on `profile-move-screen.tsx`. Never to body copy, never to error text.
   **`font-display` replaces, never combines with, `font-bold`, `font-extrabold`, or an
   explicit `fontWeight` on these targets.** Slackey ships one regular face; retaining the
   old 700/800 weight can synthesize a second weight on Android or select a fallback on
   iOS. Keep the system weight only where this phase deliberately leaves the system face
   in place, including the reveal's score number.
   **Not the reveal's own score number** (§8.2): Boogiz sets `ff="Slackey-Regular"`
   explicitly and its `Label` has no default face, so neither `well_done` nor the score
   inside `CircleProgress` is Slackey there. Giving the heading a display face is a Stepz
   decision taken here, not something ported; giving the number one is not taken at all,
   because a display face at `34/41` inside a 100 px ring is where a decorative letterform
   starts costing legibility. Verify that call on-device in Phase 4.

Native projects are generated and gitignored, so this needs a prebuild + dev-client
rebuild on both platforms before anything is visible.

---

## 6. Phase 2 — shared primitives

Only two shared pieces need work, and both stay token-only.

- **`packages/mobile-kit/src/ui/dance-skeleton.tsx`** — its `bg-panel`/`bg-panel-raised`
  blocks already follow the palette. No change; it re-tints for free. Verify only.
- **`packages/dance-flow/src/ui/record-dance-screen.tsx`** (534 lines) — its CTA at
  `:517` is `rounded-2xl bg-primary py-4`, and the secondary at `:507` is
  `rounded-2xl border border-border`. Both re-tint for free. The shared change is only
  the pill radius (`rounded-full`) on those two actions. Do **not** add `font-display`
  to the package header or labels, and do **not** change the countdown from
  `text-foreground`: those are Stepz-specific typography/achievement semantics and
  would visibly alter mobile beyond the approved radius change.
  The owner approved the radius-only move on 2026-09-18. The record screen therefore
  keeps its current shape — no `renderPrimaryAction` slot is added, and none should be
  added speculatively.
- **`packages/dance-flow/src/ui/submission-feedback.tsx:36`** — the default scored line
  is `text-neon`; it should be `text-accent`, because in Boogiz a score is always
  yellow. Stepz overrides it through `renderScored` anyway, so this only affects
  mobile's fallback.
- **`packages/dance-flow/src/ui/submission-feedback.tsx` — one new slot.** §8.1 gives the
  scanning state Boogiz's `20/25` + `16/21` typography inside a full-screen reveal, which
  the package's `text-sm text-muted` lines cannot express. Add
  `renderScanning?: ((isSlow: boolean) => ReactNode) | undefined`, exactly symmetric with
  `renderScored`, and update the JSDoc at `:9-13`: two states may now be restated, while
  the upload and failure copy — and the retry affordance the failure depends on — stay
  the flow's. Passing `isSlow` rather than the whole state keeps the slot from re-deriving
  the machine.

  **This is a decision, and the alternative was rejected on purpose.** Letting
  `ScoreReveal` re-type the strings itself would put `Scoring your dance…` in two
  packages with nothing holding them together, which is the drift that comment exists to
  prevent. Keeping the package's own typography instead would cost the scanning screen its
  scale, and the scale is the visible half of this phase. A slot makes the divergence
  explicit and leaves mobile on the default.

Other than that slot, no new shared component or prop is created in this phase. A
`GradientButton` is tempting, but only Stepz needs one until bnew's design is decided —
it lives in `apps/edu` and is promoted to `mobile-kit/ui` the day a second app renders it.

---

## 7. Phase 3 — Stepz screens

In this order, each a self-contained commit.

**3a. Feed** (`apps/edu/src/features/feed/ui/`, 742 lines)
- `feed-screen.tsx` — the filter pills at `:160` (`FilterButton`, declared at `:146`,
  `border-white/20 bg-black/40`) become Boogiz chips. Add an explicit `active` prop to
  `FilterButton`: level is active when `level !== null`, style is active when
  `genreId !== null`. An active pill uses
  `style={{ backgroundColor: RUNTIME_COLORS["primary-wash"] }}` with a `font-display`
  label; an inactive pill uses `border-border`. `ActionButton` at `:389` — the profile
  and Pro Tip circles — carries the identical `border-white/20 bg-black/40` pair and
  moves with it. `primary-wash` is not a Tailwind token (§4.3), so it is only ever a
  `style` value.
- `feed-screen.tsx` — **there is no end-of-feed footer**: the pager's `FlatList`
  declares no `ListFooterComponent`, and an earlier draft of this plan invented one.
  What actually sits at the foot of the feed and does need this pass is the
  `feed-actions` block — the pagination `ActivityIndicator` at `:362` and the
  `Dance this Move` CTA at `:367`, already `rounded-full bg-primary`, so it needs only
  `font-display` on its label. The empty state at `:264` (`No moves found` plus a
  `rounded-full bg-primary` Reset filters button) is in scope for the same pass.
- `feed-screen.tsx` — the active move title in the bottom action block takes
  `font-display`. `feed-move-page.tsx` renders only the media/playback surface; it has
  no title or level badge. Do not add a level badge as incidental design scope.
- `feed-filter-sheet.tsx` — sheet ground `bg-panel`. The selected row (`:60`, `:63`)
  **keeps `neon`**, and an earlier draft of this plan had it move to
  `RUNTIME_COLORS["primary-wash"]` with an `accent` check, contradicting §9 on the same
  two lines. §9 wins: a selected filter is neither an action nor an achievement, so it is
  exactly the secondary emphasis §9 gives `neon`, and tinting it `accent` would break the
  one rule this pass exists to establish — that yellow means a score. The row therefore
  re-tints for free with the token and needs no edit; only the sheet ground does.
- `feed-skeleton.tsx`, `pro-tip-overlay.tsx` — re-tint; the pro-tip card gets the
  `GradientStrokeWrapper` treatment (a `LinearGradient` shell with 2 px inset).

**3b. Record** — nothing app-side; Phase 2 covers it. Device check only.

**3c. Result** (`apps/edu/src/features/scan/ui/`, 499 lines) — the largest visual
change, specified in §8.

**3d. Profile** (`apps/edu/src/features/profile/ui/`, 805 lines)
- `average-score-ring.tsx` — its arc currently draws in `COLORS.neon`; it becomes
  `COLORS.accent`. Extract an app-owned `ScoreRing` into a dedicated Stepz-only
  feature, `apps/edu/src/features/score/ui/score-ring.tsx`, exposed through
  `@/features/score`. It takes explicit `percent`, `size`, `strokeWidth`,
  `trackColor`, `fillColor`, and `children` props. Move `ringHalfRotations` and both
  masked halves into it, so average, scanning and scored views share one geometry
  implementation without either Scan or Profile deep-importing the other's private UI.

  A feature folder, **not** `apps/edu/src/components/`, and **not** an export added to
  `@/features/profile`. That last one is the lighter option and it is legal — `CLAUDE.md`
  §6 lets one feature import another's `index.ts` — but it would make Scan's scoring ring
  a piece of Profile's public API, so every later change to the ring would read as a
  change to the profile feature. One shared geometry with two equal consumers is not
  either feature's; the cost of the extra folder buys that honesty back.

  The root `CLAUDE.md` §7 would send
  a shared domain-neutral primitive with two feature consumers to `src/components`, but
  `apps/edu/AGENTS.md` is the nearer guide and refines that for this subtree: *"There is
  deliberately no `src/components/`: every primitive both apps render lives in
  `@bnewapp/mobile-kit/ui`. Add one there, not here, unless it is genuinely Stepz-only."*
  A ring is genuinely Stepz-only — mobile has none, so `mobile-kit` has not earned it — and
  that clause is what keeps it in `apps/edu` at all. It does not re-open the folder edu's
  structure block deliberately omits, so the primitive lands under `features/`. Holding one
  presentational file with no `_atoms/`, no `api.ts` and no `data/` is expressly allowed
  there: §6 of `CLAUDE.md` calls the atomic split "a menu, not required ceremony". Promote
  it to `mobile-kit/ui` the day `apps/mobile` renders a ring, and delete the feature.

  The extraction is not purely a move. `average-score-ring.tsx` computes its styles once in
  a module-level `StyleSheet.create` off the `RING_SIZE` (116) / `RING_STROKE` (10)
  constants, and **six of its eight rules depend on them** — only `maskLeft` and
  `arcInLeftMask`, both `{ left: 0 }`, are size-independent. Parameterising `size` and
  `strokeWidth` means
  those become per-render values; keep the size-independent rules in `StyleSheet.create`
  and pass the rest as computed style objects, rather than calling `StyleSheet.create`
  inside the component body on every render.
- `learned-move-card.tsx`, `style-section.tsx`, `profile-summary.tsx`,
  `empty-slot.tsx`, `personal-video-section.tsx`, `profile-move-screen.tsx`,
  `profile-screen.tsx`, and `profile-style-screen.tsx` —
  re-tint, card radius to 16, scores to `text-accent font-display`. The profile count,
  filter selection, feed image tint/spinner, and recording dev hint retain `neon` as
  secondary emphasis; document that choice at each semantic use rather than treating
  every current `neon` use as a score.

---

## 8. Phase 4 — the score reveal

Ported from `boogiz-rn/src/containers/Film/components/learnskill/`. This is the one
place the plan adds behaviour, not just colour.

### 8.1 Scoring (while the scan is pending) — visually inspired by `ScoringView.tsx`

- A ring, `size 120`, `strokeWidth 10`, `accent` on the
  `RUNTIME_COLORS["score-track-scanning"]` track, centred **on an opaque black disc of
  the same 120 diameter**. The disc is not decoration: Boogiz draws one under both rings
  (`boogiz-rn/src/components/ScoreCalculationProgress.tsx`, which sits outside the
  `learnskill/` folder this phase otherwise ports from, `background={appColors.black}`),
  and it is what keeps
  the ring and its contents legible over an arbitrary video frame. Black laid over video
  is this repo's documented raw-colour exception, so it stays `bg-black`, not a token.
- Centre of the ring: Boogiz replaces the number with a 56 px `rounded_star` glyph
  (`getText`), so no percentage is ever shown while scanning. Stepz shows the simulated
  percentage instead, `accent`, `16 w700` — it is honest about being a progress
  indicator and needs no icon set. Either way the percentage is announced (§8.5).
- Enters `ZoomInEasyDown`, exits `FadeOutDown` (`react-native-reanimated`, already a
  dependency of both apps).
- Progress: Stepz has no numeric server progress — `useDanceSubmission` exposes only
  `uploading`, `scanning`, and `isSlow` — so this is deliberately simulated, not a
  fallback. Start at `5` and increment by 1, with the interval chosen from the **current**
  value, exactly as `ScoreCalculationProgress.tsx` branches: `< 50` → every 500 ms,
  `50–74` → every 800 ms, `75–94` → every 1400 ms, `>= 95` → stop. Stated as ranges on
  purpose — an earlier draft's "every 800 ms below 75" invites reading the 800 ms band as
  `< 75`, which would swallow the 500 ms band entirely. Hold at 95 until the terminal
  response. Start only in
  `scanning`, reset to 5 when a retry creates a new scanning stage, and clear every
  timeout on state change/unmount. Do not extend the shared API or pretend a
  `ScanStatus` supplies progress.
- Copy: title `20/25 w700`, subtitle `16/21 w400`, with the existing `isSlow` line
  taking the place of Boogiz's 10-second timer. **The strings stay the package's**:
  `ScoreReveal` renders `SubmissionFeedback` with the `renderScanning` slot §6 adds, so
  it restates only the typography and placement. It does not re-type
  `Scoring your dance…` or the slow-scan line.

### 8.2 Scored — from `AfterScoringView.tsx`

- A bottom `LinearGradient` to `celebrate` (`#47226C`), height `256 + bottom inset`,
  from `RUNTIME_COLORS["celebrate-fade"]` — **`rgba(71, 34, 108, 0)`, not the keyword
  `transparent`**, as `AfterScoringView.tsx:127` has it. `transparent` is transparent
  *black*, so Android interpolates the fade through grey and the band reads muddy under
  the purple. `feed-screen.tsx:318` gets away with the keyword only because its far stop
  is black.
- Heading `34/41 w700 font-display`, the existing move title in `text-copy` beneath
  it, then the ring: `size 100`, `strokeWidth 8`, `accent` on the
  `RUNTIME_COLORS["score-track-scored"]` track, on an opaque black disc of the same 100
  diameter (as §8.1, and as `AfterScoringView.tsx:184-188` has it), entering
  `BounceIn.duration(1000)`, score text `34/41 w700` in `accent`. `ScoreReveal`
  therefore receives `moveTitle` and preserves the current scored-state identification
  of the move.
- **The visible score string stays `{score} / 100`**, exactly as
  `scan-result-screen.tsx:321` renders it today. This is a decision, not an omission, and
  it is the one place §8.2 deliberately does not follow `AfterScoringView`, which shows a
  bare `82` beside a `rounded_star` glyph — a bare number reads as a score only because
  that icon is next to it, and decision 3 keeps Stepz off Boogiz's icon set. It is also
  what document 02 section 2 specifies and what the accessibility label in §8.5 restates,
  and **twenty-one** assertions in
  `apps/edu/src/features/scan/ui/__tests__/scan-result-screen.test.tsx` gate the terminal
  state on `findByText("<n> / 100")`. Keeping the string keeps those tests measuring the
  flow rather than the typography. Only the size, weight, colour and placement change.
- **Staged reveal.** Boogiz gates on `showLayoutStep` with `3000 / 3000 / 2500` ms
  delays between four steps. Stepz has no rank, no coins and no XP, so it collapses to
  **two**: the ring at 0 ms, the actions at 1200 ms (`FadeIn.duration(1000)`). Do not
  port the 8.5-second sequence — it exists to pace rewards Stepz does not have.
  Clear the 1200 ms action-gate timer on stage change and unmount as well; retry must
  never let an old timer reveal controls for a new attempt.

- **The gate breaks eighteen existing call sites, and the fix is on the test side.**
  `scan-result-screen.test.tsx` runs on real timers and reaches the scored state's
  controls immediately; RNTL's `findBy*` gives up at 1000 ms, under the 1200 ms gate. Do
  **not** add a delay prop to `ScoreReveal` so the screen can shorten it — that is test
  scaffolding wearing a production API, and it would leave the gate untested exactly
  where it ships. Instead, `scan-result-screen.test.tsx` sets the **test-local** reduced
  motion mock to `true` in its own `beforeEach`; §8.5 defines that mock. The production
  hook still reads the actual device preference. In the suite, this branch exposes the
  controls ungated, so flow assertions go back to measuring the flow; the gate itself is
  asserted on `ScoreReveal` directly with the mock set to `false`. §10 names every call
  site this touches.

### 8.3 The pass mark — ported as Boogiz has it

**Correction to an earlier draft of this plan:** Boogiz's ring is `accent` at *every*
score (`AfterScoringView.tsx:199`, `strokeColor={colors.yellowx1}`, unconditional). The
`APPROVED_SCORE = 70` threshold (`constants/post.const.ts`) does not change the ring —
it *adds* decoration around it. Stepz ports that structure exactly. A ring that dimmed below
70 would be this plan's invention, not Boogiz's design.

- **Ring**: `accent` always.
- **At every score**, the low-opacity `skill_union_bg_v2` ray burst sits behind the
  ring, as it does in Boogiz. Reproduce it as a ring of thin `accent` spokes at low
  opacity under one `withRepeat` rotation per 30 s (`useRotateEffect({duration: 30000})`).
  It is optional only as an explicit Stepz visual-quality decision: if it does not read
  on-device at 1×, omit it for **all** scores and record that intentional divergence.
- **At `score >= 70`, two additions**, each rebuilt in RN primitives per §1.3:
  1. `approved_banner` — a gold ribbon reading **APPROVED**, tucked `bottom: -24`
     under the ring. Reproduce as a ribbon: a centre pill in an `accent` vertical
     gradient with a `RUNTIME_COLORS["approved-ribbon-highlight"]` top edge, two notched
     tails behind it, and the word in `font-display` using
     `RUNTIME_COLORS["approved-ribbon-copy"]`. No image. These values are deliberately
     in the app palette (§4.3), not raw values in the component.
  2. `approved_score_affect` — a scatter of small `accent` sparkles around the ring:
     hollow rings, plus-marks, dots and rounded squares at mixed sizes. Reproduce as
     ~10 absolutely-positioned Views; a plus is two crossed rounded rects. Give them a
     staggered opacity twinkle rather than the static raster — it costs nothing once
     they are Views.
- Below 70 the reveal is the heading, move title, ring, and — when retained — the
  all-score ray burst. It has no banner or sparkles.

Boogiz's per-tier speech texts (`getScoreScannedBooText`: 40–60, 61–74, 75–99) belong to
the Boo tooltip character, which decision 3 at the head of this plan puts out of
scope. Do not port the tiers as headline copy — Boogiz's own heading is the static
`well_done` at every score.

### 8.4 Placement

The reveal is Stepz's own — `apps/mobile` uses `dance-result-screen.tsx`, which this
plan does not touch. New file: `apps/edu/src/features/scan/ui/score-reveal.tsx`. It is
an app-owned, presentational full-screen overlay — gradient, rings, timers and approved
decoration live there; submission, persistence and navigation do not.

Its contract, so §10's tests have something fixed to aim at:

```ts
interface ScoreRevealProps {
  /** Narrowed by the caller: `ScoreReveal` mounts for these two states only. */
  submission: Extract<SubmissionState, { kind: "scanning" } | { kind: "scored" }>;
  /** `null` until the move query resolves; the heading renders without it. */
  moveTitle: string | null;
  /** The save error and Back/Continue controls, revealed after the 1200 ms gate. */
  actions: ReactNode;
  onRetryUpload: () => void;
}
```

`submission` carries both `isSlow` (scanning) and `score` (scored), so the component
derives its stage from one value and cannot disagree with the screen. `onRetryUpload` is
forwarded to `SubmissionFeedback` rather than used: the scanning state has no retry, but
the package's component requires the prop and the failure path must keep owning it.
Reduced motion is read inside the component, not passed in — it is a device preference,
not a caller's decision.

`MediaScrimPanel` is currently mounted unconditionally around the entire result body.
Restructure that render so `ScoreReveal` is its **sibling**, directly over the video,
for `scanning` and `scored`; do not nest the full-screen overlay inside the bottom-
anchored scrim. The existing panel remains the surface for upload, failure and the
personal-video save/replace branch.

`scan-result-screen.tsx` remains the state owner. **The submission state is read only
when the video branch is not showing; that guard comes first, and it is
`decision === "video" && step !== null`, both conjuncts.** `confirmScore` sets `decision`
to `"video"` (`scan-result-screen.tsx:192`) while `submission.kind` stays `"scored"`, so
a reveal gated on the submission state alone would sit on top of the Save / Replace
Video prompt for the rest of the flow. The video branch is not "above" this matrix as
prose — it is a condition in the code, and it is the one thing an implementer must not
read past.

Carry `step !== null` through rather than simplifying to `decision === "video"`.
`scanDecisionAtom` is a module-level atom shared across mounts while `step` is local
state, so the two can disagree; the render at `scan-result-screen.tsx:246` already tests
both. Dropping the conjunct turns any such disagreement into an empty `MediaScrimPanel` —
a gradient band and nothing else — where the reveal belongs.

| Guard | Surface | Required content / actions |
| --- | --- | --- |
| `decision === "video" && step !== null` | Existing `MediaScrimPanel` | `SaveVideoScreen` / `ReplaceVideoScreen`, unchanged. No `ScoreReveal`, whatever the submission state is. |
| `idle` | Existing `MediaScrimPanel` | Unreachable here — the screen always mounts with a clip, so `hasClip` is never false. Listed so the matrix is exhaustive; keep today's render. |
| `uploading` | Existing `MediaScrimPanel` | Existing upload copy; no reveal and no terminal action. |
| `scanning` | `ScoreReveal` over the video | Simulated-progress ring, scoring copy and the existing `isSlow` copy; no action. |
| `scored` | `ScoreReveal` over the video | Heading, existing move title, scored ring/decorations; render the existing save error and Back/Continue controls through an `actions` slot after the 1200 ms reveal gate. `Continue` remains disabled/hidden by the existing `canConfirm` and save-error rules. |
| `failed` | Existing `MediaScrimPanel` | Existing error/retry/back behaviour, unchanged. |

In the two `ScoreReveal` rows the `MediaScrimPanel` is **not mounted at all**: an empty
panel still paints its gradient and its bottom safe-area padding, which would read as a
band under a full-screen reveal. `ScoreReveal` unmounts as soon as either guard stops
holding — the state leaving `scanning`/`scored`, or the video branch taking over — which
is what resets its progress and its reveal timer for a retry. **Do not render the actions slot at all** until its gate opens:
`pointerEvents="none"` alone leaves its descendants reachable by assistive technology.
This replaces the current scored line and reviewing/result heading only for the
`scanning` and `scored` branches; it does not replace the decision logic — confirm,
save, replace and retry remain in
`scan-result-screen.tsx`.

Before wiring the matrix, extract a `ScoreActions` fragment from the current
`ScorePanel`; it owns the save-error message plus Back/Continue controls. The existing
`SubmissionFeedback` path remains the uploading/failed surface, while scanning and
scored render `ScoreReveal`. `ScoreReveal` receives `ScoreActions` through `actions`;
it must not duplicate its conditions.

**`ScorePanel` keeps rendering `ScoreActions` itself in the `failed` branch, ungated.**
This is the step where it is easiest to drop: `ScorePanel`'s current `isTerminal`
(`scan-result-screen.tsx:307`) is `scored || failed`, so pulling those controls out for
the scored reveal removes them from the failed state too unless the fragment is mounted
back in there. `ScoreReveal` gates its copy behind 1200 ms; `ScorePanel` must not, which
is exactly why `:387`'s Back assertion needs no reduced-motion `beforeEach` (§10). This
preserves the current failed retry/back surface verbatim while giving scored state its
new layout.

### 8.5 Accessibility and reduced motion

- `ScoreRing` remains one accessible element. The average variant preserves its current
  label; scanning exposes a concise scoring status and current simulated percentage; scored
  exposes the final score out of 100. Its internal masks and arc Views are not individually
  accessible.
- **Announce scanning progress deliberately, not by assuming an updated label is read.**
  Give the scanning status element `accessibilityLiveRegion="polite"` for Android and use
  `AccessibilityInfo.announceForAccessibility` for iOS/VoiceOver. Announce the initial
  5%, then only each crossed 10% milestone and the terminal 95% hold (for example,
  `"Scoring your dance, 50 percent"`); never announce every 500 ms increment. Reset the
  last-announced milestone when a retry creates a new scanning stage, and clean up any
  announcement-related effect on unmount. The screen-reader wording is testable as a
  small pure milestone helper; device verification covers the platform announcement.
- The ray burst, sparkles and APPROVED ribbon are decorative and excluded from the
  accessibility tree. The visible score heading and move title remain readable text.
- Respect the system reduced-motion preference: keep the final state visible but skip
  or shorten the ring entrance, ray rotation and sparkle twinkle. The 1200 ms action
  gate must not delay controls for a reduced-motion user.
- **The production API is `useReducedMotion()` from `react-native-reanimated`** (`~4.2.1`,
  already a dependency of both apps), read inside `ScoreReveal`. Nothing in `apps/` or
  `packages/` reads a motion preference today — this is the repo's first use, so there is
  no local precedent to copy and none to break. The hook snapshots the setting when the
  module loads; that is sufficient for a device preference, and it is not a runtime
  control for tests.
- **Use an explicit local Jest mock; do not change the shared harness.** At the top of
  both new `score-reveal.test.tsx` and the existing `scan-result-screen.test.tsx`, before
  their component imports, declare `let mockReducedMotion = false` and a hoisted
  `jest.mock("react-native-reanimated", ...)`. Its factory spreads
  `require("react-native-reanimated/mock")` and adds
  `useReducedMotion: () => mockReducedMotion`. Reanimated's package-provided Jest mock
  omits this export, while the shared harness otherwise leaves Reanimated real; this local
  replacement supplies the only controllable seam the tests need. The `mock` prefix is
  intentional: Jest permits that mutable binding in a hoisted factory.

  `score-reveal.test.tsx` resets it to `false` in `beforeEach`, setting it to `true` only
  for the immediate-actions reduced-motion case. `scan-result-screen.test.tsx` resets it
  to `true` in its `beforeEach`, because its real-timer flow assertions must bypass the
  1200 ms gate. No test changes a device setting, and no application prop exposes the
  preference. This mock is part of Phase 4's first commit: add and run its two branch
  tests before migrating the eighteen call sites.

---

## 9. Decisions, resolved 2026-09-18

1. **The Stepz palette (§4.3) is approved as written.**
2. **The 70-point pass mark is ported as Boogiz has it** — see §8.3, which corrects an
   earlier draft: the ring is `accent` at every score, and 70 adds the banner, the
   sparkles and the optional glow.
3. **`apps/mobile` is allowed to move** (§6), in exactly **two** visible ways: pill
   radius on the record screen's two buttons, and the shared fallback scored line moving
   from `text-neon` to `text-accent`. An earlier draft said "nothing else visible", which
   contradicted §6, point 4 below, and §4.1 — whose Phase 0 device check *depends* on that
   line being mobile's one rendered `accent` surface. `dance-result-screen.tsx:66` passes
   no `renderScored`, so the package's own fallback is what mobile shows. Display
   typography and countdown colour remain Stepz-only.
4. **`neon` stays, with a defined job.** Decided by the implementer, per the owner.

   After this change `accent` owns achievement and `primary` owns action. Every score
   in Stepz moves to accent: the average ring, the scan result, and the saved score on
   `profile-move-screen.tsx`. The shared fallback score also moves from `text-neon` to
   `text-accent`.

   It is **not** retired. Shared packages ship `text-neon`
   (`record-dance-screen.tsx:491`), so the token name is a fixed part of the contract.
   Its Stepz job is **secondary emphasis on a dark ground**: the feed's pull-to-refresh
   tint (`feed-screen.tsx:311`) and pagination spinner (`:362`), the profile count
   (`profile-summary.tsx:25`), and the selected filter row and its label
   (`feed-filter-sheet.tsx:60`, `:63`). Three more are package-owned and re-tint with the
   token rather than being changed: the record screen's simulated-recording dev hint
   (`record-dance-screen.tsx:491`), and the shared dev menu's DEV badge and the FAB border
   behind it (`packages/mobile-kit/src/ui/dev-menu.tsx:91` and `:89`). It lifts a
   metadata value off `copy` without claiming to be an action or a score. That is how
   Boogiz uses its light purple (`primary2`, `rgba(214,158,250,*)`) and it keeps the
   three-way split legible — purple acts, yellow rewards, light purple merely draws the
   eye.

## 10. Validation

Per phase, narrowest first:

```sh
corepack pnpm --filter @bnewapp/edu typecheck
corepack pnpm --filter @bnewapp/edu test
corepack pnpm --filter @bnewapp/mobile-kit test
corepack pnpm --filter @bnewapp/dance-flow test
corepack pnpm --filter @bnewapp/mobile test     # Phase 0 and 2 only
corepack pnpm lint
```

Add focused tests with the implementation rather than relying only on the existing
result-flow tests:

- `ScoreRing`: `ringHalfRotations` leaves `average-score-ring.tsx`, so the **existing**
  `apps/edu/src/features/profile/ui/__tests__/average-score-ring.test.ts` — which
  imports it from `../average-score-ring` at `:1` and would break — moves with it to
  `apps/edu/src/features/score/ui/__tests__/score-ring.test.ts`. It has **five** cases,
  not three, and clamping outside `0..100` is **already** among them (`:31-34`); move all
  five unchanged and do not re-add coverage the file has. What it genuinely lacks is a
  render test: mount at the average, scanning and scored sizes and assert `size`,
  `strokeWidth`, `trackColor` and `fillColor` reach the arc and the track.
- `ScoreReveal`: give the ring, approved decoration, all-score ray burst, move title,
  and gated actions stable test IDs. This file, not the screen's, is where the gate is
  proved. With fake timers and reduced motion **off**, test initial 5 and the three
  progress intervals, cleanup and reset after retry, 69 versus 70 decorations, the ray
  burst's all-score behaviour when enabled, and actions absent from both the touch and
  the accessibility tree before 1200 ms. Assert the scanning and final-score labels, that
  decorations are inaccessible, and — with reduced motion **on** — that the actions are
  present immediately, which is the branch the screen's own suite then relies on. Unit-test
  the progress-announcement milestone helper (initial 5, each 10% boundary, 95, and retry
  reset); on-device verification confirms the iOS and Android announcement path.
- `ScanResultScreen`: every row of the state matrix above. Two rows carry the risk:
  that confirming a score unmounts `ScoreReveal` and leaves the Save / Replace Video
  prompt alone on the screen, and that failure retry plus save/continue behaviour after
  the action slot opens are unchanged.
- **`scan-result-screen.test.tsx` changes in two places, and an earlier draft of this
  plan claimed only one. Budget for both before starting Phase 4.**

  **(a) The scrim inset test moves branch.** `:272`, "holds the score panel above the
  system bar the clip plays under", reaches the scored state and then asserts
  `getByTestId("scan-result-panel")` carries `paddingBottom: 48 + 24` (`:279`). Scored is
  precisely the branch that stops mounting `MediaScrimPanel`, so re-point that test at a
  state that still mounts it — the `failed` branch is the cheapest, since it needs no
  confirmation step. Do not delete it: the inset contract it guards still holds for
  uploading, failed and the save/replace prompt.

  **(b) Every scored-state action assertion needs the test-local reduced-motion mock from
  §8.5, set to `true` in this file's `beforeEach`.** The file runs on real timers, so the
  1200 ms gate otherwise puts the controls out of reach of `getBy*` entirely and of
  `findBy*`'s 1000 ms default. The affected sites:

  | Site | What it touches |
  | --- | --- |
  | `:172` `confirmScore()` helper — **12 callers** (`:329`, `:342`, `:459`, `:470`, `:482`, `:510`, `:529`, `:552`, `:569`, `:585`, `:609`, `:639`) | presses Continue right after the score appears |
  | `:269` | `getByRole` Continue |
  | `:353` | `getByRole` Continue, then two presses |
  | `:402` | `getByRole` Back, in the scored state at score 20 |
  | `:415` / `:419` / `:421` | `findByText("Couldn't save your score")`, the save-retry press, then Continue — the save-error block lives in `ScoreActions` and is gated with the rest |

  `:387`'s Back assertion is **not** affected: it is the `failed` row, which keeps
  `MediaScrimPanel` and its ungated controls.

  Every other assertion in the file survives, because §8.2 keeps the `{score} / 100`
  string the twenty-one terminal-state assertions gate on, and because the scanning copy
  stays the package's (§6), so nothing asserts a string that moved.
- `SubmissionFeedback`: cover the `renderScanning` slot §6 adds — that it receives
  `isSlow`, that omitting it leaves mobile on the package's own two lines, and that the
  failed state's retry is untouched by either slot.
- Expo config: evaluate the generated Stepz config and assert that it preserves every
  shared plugin plus the exact `expo-font` plugin entry. `packages/mobile-kit` has no
  test for `createExpoAppConfig` today; the harness picks a new
  `packages/mobile-kit/expo/__tests__/` file up without config changes.

Device verification is required — this is a visible change and nothing above is
provable by tests alone:

- **Phase 0**: `apps/mobile` on **Android**, confirming the added `accent` token resolves
  — the shared fallback scored line (§6) is the one surface that renders it, and §4.1's
  value is distinct from `neon` precisely so this check can fail — and that record-screen
  typography is unchanged.
- **Phase 1**: `apps/edu` after prebuild on iOS and Android, confirming Slackey is
  embedded and that no screen falls back.
- **Phase 3**: every Stepz screen, both platforms, against the §1 table.
- **Phase 4**: the full scan → score path, watching the staged reveal land, checking 69
  and 70 on-device, confirming the failure path still reaches its retry, and confirming
  that Continue hands over to the Save / Replace Video prompt with no reveal left on
  top of it.

Screenshot-diff the feed and profile before Phase 3 to keep an honest before/after.
