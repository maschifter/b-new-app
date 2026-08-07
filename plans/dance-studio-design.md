# Dance Studio — System Design & Business Logic (spot-based)

## 1. System goals

Each user owns a **studio (room)** and decorates it by **assigning items into predefined positions (spots)** in the room. The layout is saved, other users can **visit and view it**, and as a user levels up they will unlock **additional rooms**.

Guiding principles:

- **Faked depth (2.5D)**, no real 3D — the room is a flat, multi-layered stage.
- **The layout is data, not imagery** — the system stores "which spot holds which item"; images are a presentation layer that can be swapped.
- **Constrained placement, not free** — users cannot place things anywhere; each spot only accepts compatible items.
- **Local first, sync later** — runs offline immediately; storage is isolated so a backend can be plugged in later without changing the business logic.

## 2. Core concepts (domain)

| Concept | What it is | Business notes |
|---|---|---|
| **Catalog Item** (item definition) | The library of every placeable thing. Shared across all users. | Each item carries **tags**: type (video / furniture / ceiling / floor / wall / decor), size (S/M/L)… Unlock conditions can be added later. |
| **Content source** (what fills a spot) | A spot is filled by a reference, not always a shared asset. Two sources: a **catalog item** (shared, static) or a **user video** (per-user, dynamic — e.g. a top-rated / favorite dance clip). | Because this is a dance concept, video spots are meant to showcase the user's own dance content, which is **UGC**, not a shared catalog asset. |
| **Spot** (placement position) | A **fixed** position in the room, defined by designers. | Each spot has: a **position** (tied to the art), a **size**, an **accept rule** (which tags it accepts), and a **layer order** (draw order). |
| **Room Template** (room shell) | The set of **Spots** for one kind of room, tied to a theme. Created by *designers*, shared. | This is the room's "map of slots". |
| **Room / Decoration** (a user's decoration) | Per user: **which spot currently holds which item**. | Just a compact **`spot → item` map**. |
| **Theme** | The room's background / shell (walls, floor, atmosphere). | Comes with a Room Template. |
| **Owner / Visitor** | The room owner vs. someone viewing the room. | Determines permissions (section 4). |

**Relationships:** a *User* owns a *Room*; each *Room* is based on a *Room Template* (a set of Spots) plus a *Decoration* (spot→item); each filled slot points to a **content source** — either a *Catalog Item* or a *user video*.

> The reference stored in a slot is kept **generic** so the map stays stable when video content is added later:
>
> ```
> spot → { source: "catalog", id }   // shared asset
> spot → { source: "video",   id }   // user's dance clip (UGC)
> ```

> Big difference from the earlier direction: **free coordinates (x/y/scale) are gone**. Positions are fixed by the Spot.

### 2.1 Data shapes (interface sketch)

These fix the *interface* even though open question #1 (the exact compatibility criterion) is parked. The tag representation and the `fits()` signature are settled now so the rest of the system can be built against them.

```ts
// Tags are a flat bag; values are single or multi-valued.
type Tags = Record<string, string | string[]>;

// A spot's accept rule is a predicate shape, not baked-in logic.
// Today it can be the simplest AND-of-tags; it can grow to allow-lists
// without changing this type.
type AcceptRule =
  | { kind: "tags"; require: Tags }          // e.g. { type: "floor", size: "L" }
  | { kind: "allow"; ids: string[] };        // explicit allow-list

interface CatalogItem {
  id: string;
  tags: Tags;                                 // type, size, …
}

interface Spot {
  id: string;
  // Position is designer-authored but stored NORMALIZED (0..1) against a
  // fixed design canvas, never in device pixels — see §9.1.
  frame: { x: number; y: number; w: number; h: number };
  layer: number;                              // fixed draw order
  accept: AcceptRule;
}

interface RoomTemplate {
  id: string;
  themeId: string;
  spots: Spot[];
}

// What a filled slot points at — kept generic so video can be added later.
type ContentRef =
  | { source: "catalog"; id: string }
  | { source: "video"; id: string };          // user's dance clip (UGC)

// The whole per-user decoration is this tiny, versioned snapshot.
interface DecorationSnapshot {
  version: number;
  templateId: string;
  map: Record<string /* spotId */, ContentRef>;
}

// The one compatibility policy (§9.4). Pure, UI-free, unit-testable.
declare function fits(item: CatalogItem, spot: Spot): boolean;
```

## 3. Placement model & compatibility rule (the core)

- **Positions are defined by the template**, not by the user. Users only *choose an item for a spot*; there is no free drag-and-drop.
- **Layer order (depth) is fixed** in the template → no depth-sorting algorithm needed.
- **The spot ↔ item compatibility rule is a separable policy.** Both spots and items carry **tags**; a spot declares "what it accepts"; an item fits if it **satisfies** that condition.

This tag mechanism can express any criterion we might settle on later — so **the exact criterion does not need to be decided today**:

| If later we want… | The spot declares |
|---|---|
| By size (Large item → Large spot) | accepts: `size = L` |
| By type/surface (floor items only) | accepts: `type = floor` |
| Combined | accepts: `type = floor` **and** `size = L` |
| An explicit allow-list | accepts: `{sofa, pouf, bench}` |

> Example: a "Hero Screen" spot accepts `type=video, size=L` → only the large screen fits; a sofa or plant is rejected. A "Small Decor" spot accepts `type=decor, size=S` → plants / trophies / basketballs fit.

## 4. Actors & modes

| Mode | Who | What they can do |
|---|---|---|
| **Edit** | Room owner | Select a spot → assign / swap / clear an item → save. |
| **Preview** | Room owner | See the room exactly as visitors will. |
| **Visit** | Another user | View only (read-only). Later: like, watch videos, switch rooms. Cannot edit someone else's items. |

A single rendering mechanism serves all three modes, differing only in "whether item assignment is allowed". → the "visit" feature is nearly free.

## 5. Business rules

1. **Only compatible items can be placed** — an item must satisfy the spot's accept rule (section 3).
2. **Each spot holds at most one item** — choosing a new item replaces the old one; a spot can be empty.
3. **Layer order is fixed** by the template (no dynamic depth-faking).
4. **Ownership** — only the owner can edit their own room; visitors can only view.
5. **Autosave** — every change is saved after a short debounce; no "Save" button needed.
6. **Recoverable** — reopening the app shows the exact decorated room.
7. **Video (a performance constraint turned into a rule):** multiple video zones are allowed, but **only one video plays at a time**; the others show a poster image until tapped. A single small **playback controller** owns arbitration: tapping zone A pauses whatever is currently playing before starting A. In Visit mode the same controller decides autoplay (e.g. the top-most/most-central visible zone).
8. **Reconcile on load** — a saved snapshot is validated against the *current* template + catalog before rendering: entries pointing at a removed item, a removed spot, or a spot whose accept rule no longer matches are **dropped (or flagged), not rendered**. Compatibility (Rule 1) is therefore enforced at **both write and read**, using the same `fits()` policy — because templates and the catalog are designer-owned and will change after a room is saved.

## 6. Lifecycle & storage

```
Load raw snapshot → Migrate (if version < current) → Reconcile against template+catalog
  → Ready (render room)
        ↓ (owner assigns/swaps an item)
  Unsaved changes → Saving → Saved
```

- A user's decoration data is tiny: **`{ version, templateId, spot→item map }`** (see §2.1).
- A single **storage gateway (Repository)** is the only thing that touches storage: today it writes to the device; later it swaps to Supabase — without touching the business logic.
- The snapshot carries a **version number** → structural upgrades (single room → multiple rooms) can still read old data. **Migration is explicit:** on load, if `version < current`, run an ordered migrator chain to upgrade the shape *before* rendering; the Repository never hands business logic a stale shape.
- **Reconcile before render:** after migration, validate the map against the current template + catalog and drop/flag invalid entries (Rule 8). Loading is `read → migrate → reconcile → render`.
- **Conflict model (once synced):** the room is written as one JSON blob, so remote sync is **last-writer-wins per owner**. This is acceptable for a single-owner room; the known limitation is **same user, two devices editing offline** — the later write clobbers the earlier. Noted, not solved now.
- **Visiting** = load another user's `{templateId, map}` and re-render it with the same rendering mechanism (the template + catalog already exist on the client). For a visitor to load the owner's dance clip, any **user video** a slot references must be readable by that visitor — which, for public visiting, implies public-read on the video. That is a **privacy/consent decision, not a settled fact** (see open question #7); the room *row* being publicly readable is separate and lower-stakes.

## 7. Expansion roadmap

| Stage | Business | What the design already prepares |
|---|---|---|
| **Foundation (now)** | 1 room, assign items to spots, local save, placeholder blocks | Sections 2–6 |
| **Visiting** | View another user's room (read-only) | Visit mode reuses the rendering mechanism |
| **Multiple rooms** | Level up → unlock rooms, switch with ← → | Snapshot versioning; "room" decoupled from "user" |
| **Backend** | Server sync, others see the real room | Swap the storage gateway's internals to Supabase |
| **Economy / unlocks** | Items/templates/spots unlocked by level or purchase | Catalog Item & Template leave room for unlock conditions |

## 8. Open business questions (not blocking a start)

1. Exact compatibility criterion: by **size**, by **type**, **both**, or an **explicit allow-list**? *(parked behind the "tag rule")*
2. How many spot **types/sizes**?
3. Do items have **color/style variants**, or is one item = one look?
4. New user's room: **empty** or minimally pre-decorated?
5. **Unlocking items** by level / purchase from the start, or everything available?
6. **Video source & selection:** where does a user's dance video for a video spot come from — manual pick, **top-rated**, or **favorites**? And what representation do we ship for smoothness — a **muted looping MP4/HEVC** or **animated WebP** (preferred), with GIF only as a fallback? *(placement mechanism is decided; only the content-source feature and format are parked)*
7. **Video privacy/consent:** placing a personal dance clip in a visitable room makes it loadable by visitors (public-read, per §6). Is that consented and moderated? What's the abuse/takedown story for the video bucket? *(blocks nothing in the local foundation; must be answered before public visiting ships)*

## 9. Technical overview

### 9.1 How the room is rendered

- The room = **flat image layers**: background (theme) + each filled spot is an image placed into the spot's frame. A **video** spot is just another layer whose visual is a swappable representation (image poster → looping preview → real video for the one active zone), so it slots into the same layer model.
- **Draw order comes from the template** (each spot has a fixed layer) → no depth computation.
- **Responsive stage:** art is authored against a **fixed design canvas**; at runtime the stage is **uniformly scaled to fit** the device (letterboxed), and spot frames are stored **normalized (0..1)** rather than in pixels (see §2.1). This keeps one layout correct across screen sizes and aspect ratios without per-device coordinates.
- Start with basic image components; **leave a path to an effects canvas** (neon glow, lights) only if needed.

### 9.2 Interaction

- Fixed spots make interaction **much simpler**: **no finger-following drag**. It's just *tap a spot → show the list of compatible items → pick one*.
- Gestures/animation are only for experience polish (selection feedback, opening the item picker), not for placement logic.

### 9.3 State management

- **Editing state** (selected spot, item map, saved-or-not) is kept locally, one-directional: *action → update the map → re-render*.
- **Server data** (profile, other users' rooms) uses the app's cached data-fetching layer — **React Query** (`@tanstack/react-query`, already installed).

### 9.4 The compatibility rule = a pure policy

- Kept separate as a single **`does this item fit this spot?` function**, decoupled from the UI.
- Today it can be the simplest possible; changing the criterion later only touches this function → **easy to test, easy to swap**.

### 9.5 Storage & sync

- One **storage gateway**: local (device storage) → later Supabase (likely a `rooms` table with the map stored as **JSON** — read/write the whole room at once).
- Server-side later: **only the owner can write**, rooms are **publicly readable** for visiting — enforced via database-level permissions. Reuses the existing Supabase auth.

### 9.6 Performance

| Issue | Constraint | Approach |
|---|---|---|
| Many video zones | Devices limit simultaneous video decoders & drain battery | "One video at a time" rule; other zones are images |
| Video start delay / jank | A real video decoder has startup latency and stutters when many are on screen | The "video" a slot shows is a **swappable representation**, not necessarily a raw video file: it can be an optimized **muted looping clip**, an **animated WebP** preview (GIF only as a fallback — heavier, lower quality), or another lightweight format chosen for **smooth, instant playback**. Raw video is reserved for the single active zone; the rest show the cheap representation. |
| Many image layers | Too many layers → jank | Finite spot count per template (naturally bounded) |
| Heavy images | Uses RAM | Cache + size images to the screen |

### 9.7 Mobile libraries

**Foundation (this stage) — 0 new libraries.** Fixed spots even remove the need for heavy drag handling, so only what's already present is needed:

| Purpose | Library | Status |
|---|---|---|
| Editing state | `useReducer` + Context (React core) | built-in |
| Local save (offline) | `@react-native-async-storage/async-storage` | installed |
| Render background/items placeholder, picker | `View` / `Image` / `Modal` (RN core) | built-in |
| Touch feedback / animation (polish) | `reanimated` + `gesture-handler` | installed (light use) |

**Add later, per stage:**

| Purpose | Suggested library | When |
|---|---|---|
| Render real art + image caching | **`expo-image`** | When graphics exist |
| Video zones | **`expo-video`** | When building the video zone |
| Proper UUIDs for sync | `expo-crypto` | When moving to Supabase (optional) |
| Advanced neon/light/mask effects | `@shopify/react-native-skia` | Only if the design needs it |
| Background gradient, haptics | `expo-linear-gradient`, `expo-haptics` | Optional, small |

### 9.8 Testing (overview)

- The **compatibility rule** and **item-assignment logic** are decoupled from the UI → unit-testable without running the app.
- The **storage gateway** is tested with an in-memory fake.
- The **user flow** (assign item → save → reopen intact) is tested on a simulator/emulator.

---

**The spirit of this design:** the room is *flat image layers placed into fixed spots*; the decoration is *a lightweight spot→item map*; placement constraints live in *one swappable compatibility rule*; and storage sits behind *one gateway with replaceable internals*. This lets the foundation survive design changes and move to a backend with almost no rework.
