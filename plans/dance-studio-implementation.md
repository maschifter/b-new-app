# Dance Studio — Implementation Plan (Foundation)

Companion to `plans/dance-studio-design.md`. That doc is the *what & why*; this is
the *how & in what order*. Scope here is the **Foundation stage only** (§7 of the
design): one room, assign items to spots, local save, placeholder blocks.

## Guardrails for this stage

- **No backend.** Everything runs local-first. No Supabase table, no migrations,
  no changes to `apps/server`. Persistence is on-device (AsyncStorage) behind a
  single storage gateway whose internals swap to Supabase in a later stage.
- **No new dependencies.** Everything the foundation needs is already installed
  (`@react-native-async-storage/async-storage`, `@tanstack/react-query`,
  `reanimated`, `gesture-handler`). See design §9.7.
- **No art, no real video.** Spots and background render as labelled colored
  blocks. Real art (`expo-image`) and video (`expo-video`) are later stages.
- **Author does the on-device runs.** Claude does not launch the simulator. At
  each milestone that needs visual checking, Claude states the command, the
  screen, and exactly what to expect / tap; the author runs it and reports back.

## Decisions locked (all reversible later)

- **`fits()` matching** — rule `kind:"tags"`: every required key must match, where
  a key matches when the item's value(s) intersect the required value(s) (handles
  single- and multi-valued tags on both sides). **A missing key on the item = reject.**
  Rule `kind:"allow"`: `ids.includes(item.id)`.
- **Visit mode shares the reducer** — assignment actions are inert in preview/visit.
  One rendering mechanism for all three modes (design §4).
- **Seed = 1 room, 7 spots** (see Phase 2). Layers are sparse integers so future
  inserts need no renumbering.
- **Repository keyed by `ownerId`** from the start (`studio:v1:<ownerId>`) so
  visiting becomes `load(otherUserId)` with no interface change.

## Architecture (maps onto the existing feature-first layout)

```
apps/mobile/src/features/studio/
  domain/
    types.ts        # Tags, AcceptRule, CatalogItem, Spot, RoomTemplate, ContentRef, DecorationSnapshot (from design §2.1)
    fits.ts         # fits(item, spot) — pure compatibility policy (§9.4)
    reconcile.ts    # validate map vs current template+catalog, drop invalid (§5 rule 8)
    migrate.ts      # ordered version-migrator chain (§6)
  data/
    catalog.ts      # seed CatalogItem[] (placeholder blocks)
    templates.ts    # seed RoomTemplate(s)
  storage/
    repository.ts               # DecorationRepository interface (the swap seam)
    async-storage-repository.ts # device impl
    memory-repository.ts        # in-memory fake for tests
  state/
    decoration-reducer.ts       # pure reducer: assign/clear/select/mode/save-status
    studio-provider.tsx         # useReducer + Context + load pipeline + debounced autosave
  ui/
    studio-stage.tsx  # letterboxed scaled canvas; normalized frames -> device px
    spot-layer.tsx    # one spot's block, positioned + layer-ordered
    item-picker.tsx    # modal: compatible items for the selected spot
    studio-screen.tsx  # top-level, mode-aware; mounted by the route
  index.ts
```

- Route: `apps/mobile/src/app/(tabs)/studio.tsx`, under the `session !== null` guard in
  `src/app/_layout.tsx`; Studio is the default authenticated tab.
- Domain stays in the feature folder (not `packages/`) — nothing else consumes it
  yet; promote later if the server needs `fits()`.
- Load pipeline (`read → migrate → reconcile → render`) lives in the provider,
  **above** the repository. The gateway only does raw I/O.

### Core interfaces (from design §2.1 — copied as the contract)

```ts
type Tags = Record<string, string | string[]>;
type AcceptRule =
  | { kind: "tags"; require: Tags }
  | { kind: "allow"; ids: string[] };
interface CatalogItem { id: string; tags: Tags; }
interface Spot { id: string; frame: { x: number; y: number; w: number; h: number }; layer: number; accept: AcceptRule; }
interface RoomTemplate { id: string; themeId: string; spots: Spot[]; }
type ContentRef = { source: "catalog"; id: string } | { source: "video"; id: string };
interface DecorationSnapshot { version: number; templateId: string; map: Record<string /* spotId */, ContentRef>; }
declare function fits(item: CatalogItem, spot: Spot): boolean;
```

### State shape

```ts
type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
interface StudioState {
  templateId: string;
  map: Record<string, ContentRef>;
  selectedSpotId: string | null;
  mode: "edit" | "preview" | "visit";
  status: SaveStatus;
}
// actions: HYDRATE · SELECT_SPOT · ASSIGN · CLEAR · SET_MODE · SAVE_START · SAVE_OK · SAVE_ERROR
```

Autosave: any map change -> `dirty`; provider effect debounces (~600ms) ->
`repository.save()` -> `saving` -> `saved` / `error`. No Save button (design §5 rule 5).

## Build order — a "walking skeleton"

A thin vertical slice first (see the room early), then thicken. First hands-on
pass targets **Phase 1→3**, then pause for an on-device look, then **4→6**.

### Phase 0 — Test harness
Add `jest-expo` + `@testing-library/react-native` + `jest`; wire the `test`
script and `jest.config`. Deliverable: `pnpm --filter @bnewapp/mobile test` runs
green on a trivial sample test.

### Phase 1 — Domain core (invisible, fully tested)
`types.ts`, `fits.ts`, `reconcile.ts`, `migrate.ts` (v0→v1 no-op today, chain
wired). Pure, UI-free.
Acceptance: unit tests pass (see Test plan). Nothing on screen yet.

### Phase 2 — Seed data
`catalog.ts` + `templates.ts`: one room, 7 spots, ~2–3 compatible items each.

| spot id        | layer | accepts                | placeholder |
|----------------|-------|------------------------|-------------|
| `floor-main`   | 10    | `type=floor, size=L`   | rug/stage   |
| `wall-art`     | 20    | `type=wall, size=M`    | poster      |
| `hero-screen`  | 30    | `type=video, size=L`   | big screen  |
| `ceiling-light`| 40    | `type=ceiling`         | light       |
| `decor-1`      | 50    | `type=decor, size=S`   | plant       |
| `decor-2`      | 50    | `type=decor, size=S`   | trophy      |
| `decor-3`      | 50    | `type=decor, size=S`   | plant       |

Background = flat dark placeholder. Frames stored normalized (0..1) against a
fixed design canvas (390×844).

### Phase 3 — Render the room (first visible milestone)
`studio-stage.tsx` + `spot-layer.tsx` + `studio-screen.tsx` + Studio tab route.
Letterbox math: `scale = min(w/CW, h/CH)`, center; each spot
`x*CW*scale + offsetX`, etc.; absolute layers sorted by `spot.layer`. Renders
seed data statically (a couple of spots pre-filled), **no interaction yet**.
→ **On-device check #1** (author runs). Expect: open the My Studio tab, see a
letterboxed room with labelled colored blocks in the right positions and stacking
order, correct on different screen sizes.

### Phase 4 — Interaction
`item-picker.tsx` + reducer + provider (in-memory only, no persistence yet). Tap
a spot → modal lists items where `fits()` is true → pick → block updates; clear
empties it.
→ **On-device check #2**. Expect: tap a spot opens a picker of only-compatible
items; picking swaps the block; clearing empties the spot.

### Phase 5 — Persistence (autosave + remember)
`repository.ts` + `async-storage-repository.ts`; wire debounced autosave and the
`HYDRATE` load path.
→ **On-device check #3**. Expect: decorate, kill the app, reopen → the room is
exactly as left.

### Phase 6 — Reconcile on load
Insert `migrate → reconcile` before render in the load pipeline. Entries pointing
at a removed item / removed spot / now-incompatible spot are dropped, not rendered.
Acceptance: covered by unit tests (Phase 1) + a manual check where a seed item is
removed and the previously-saved room drops that spot instead of crashing.

## Deferred (later stages, not this plan)
Real art (`expo-image`) · real video zones + one-at-a-time controller
(`expo-video`) · preview/visit UI surfaces · multiple rooms + unlocks · Supabase
sync (swap the gateway internals) · the design's open questions §8 #1–#7.

## Test plan (Jest + RNTL)
- **`fits`** — size / type / combined / allow-list; multi-valued tags; missing-key rejection.
- **`reconcile`** — drops removed-item / removed-spot / now-incompatible entries; keeps valid ones.
- **`migrate`** — v0→v1 no-op today; chain wiring tested so future bumps are safe.
- **Repository** — save→load round-trip against the in-memory fake.
- **Reducer** — assign replaces, clear empties, dirty→saving→saved transitions.
- **RNTL flow** — render stage → tap spot → pick item → block appears in the spot.
