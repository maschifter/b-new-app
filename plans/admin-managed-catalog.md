# Admin-Managed Studio Catalog — Design Plan

## 0. Decision summary

Today the studio decoration catalog is hardcoded: `CATALOG` (39 items) lives as a
compile-time constant in `packages/studio-core/src/catalog.ts`, item art is a bundled
`require()` map in `apps/mobile/src/features/studio/ui/art.ts`, and the server reconciles
saved rooms against that same constant. The goal is to make the catalog **admin-managed**
so the team can view, add, edit, hide/show, and (later) sell decoration items without a
mobile release — while keeping the app fast and offline-friendly.

Confirmed decisions (from design discussion):

- **Economy**: not built now. Phase 1 makes the catalog dynamic and admin-managed; every
  item stays free/available to all users exactly as today. The schema carries economy
  **seams** (`access`, `price`, a designed-but-inert `user_items` table) so Phase 2 can add
  buying/ownership without a rewrite.
- **Scope**: design the full target now, build Phase 1 first.
- **Art hosting**: **remote-only**. Items stay hidden while `art_url` is null and become visible
  only after an admin uploads art to Supabase Storage. Bundled item images are not used as
  a runtime fallback, so the upload path is testable and authoritative for legacy and new items.
- **Storage**: **Supabase Storage**, bucket `catalog-art`, public-read. Writes only through
  the server (secret-key client). No new storage vendor.
- **Upload path**: proxied through Fastify (`/api/admin/catalog/:id/art`), not
  browser-direct. The server validates, normalizes, and computes the hit-box.
- **Image processing**: `sharp` on the server — cap to ~1024px long edge, re-encode to WEBP,
  strip metadata, and compute the alpha bounding-box hit-box. **Deploy target CONFIRMED: Railway**,
  whose default builder (Nixpacks/Railpack) produces a **Linux x64 glibc** image — so `sharp`
  (>=0.33) installs its prebuilt `@img/sharp-linux-x64` binaries with **no native compile and no
  postinstall build step**, so **no `onlyBuiltDependencies` entry is required**. Railway runs its own
  `pnpm install` on Linux, so the correct platform binary is fetched there regardless of the dev
  machine (darwin arm64, which resolves `@img/sharp-darwin-arm64`). Two residual checks: (a) pin
  `sharp` to a version using the prebuilt `@img/*` packages (>=0.33); (b) with the repo's
  `node-linker=hoisted`, confirm `@img/sharp-linux-x64` resolves at runtime after the Railway build
  (no `--no-optional`, no bad hoist). No responsive sizes / thumbnails / on-the-fly transforms (YAGNI).
- **Hit-box shape**: the stored hit-box must match the existing mobile `ArtHitBox` contract
  (`{ size: {width,height}, opaqueBounds: {x,y,width,height} }`, source pixels), **not** a bare
  normalized `{x,y,w,h}`. The room renderer's `hitTargetStyle` needs the source aspect ratio
  (`size`) to reproduce the `contain` offset, so a normalized opaque box alone is insufficient.
  Store the processed image's pixel dimensions plus the opaque pixel bounds.
- **Cache strategy**: content-hash filenames → immutable URLs with a long `max-age`; catalog
  list carries a `version` so mobile knows when to refetch.

Key architectural leverage that makes this cheap: `reconcile(snapshot, template, catalog)`
in `studio-core` **already takes the catalog as a parameter**, and `fits()` matches purely on
tags. So the domain logic does not change — we only change **where the catalog array comes
from** (DB instead of a constant), and the tag-driven compatibility keeps working for new
items automatically as long as their tags match an existing spot's accept rule.

## 1. Current state (verified)

- `packages/studio-core`
  - `CatalogItem = { id: string; tags: Tags }`; `Tags = Record<string, string | string[]>`.
  - `CATALOG: CatalogItem[]` — 39 items, tags `type` (video/preview/tall/low/lounge/ceiling/
    floor/wall/decor) + optional `size` (S/M/L). No art, price, or ownership.
  - Pipeline `coerceSnapshot → migrate → reconcile(snapshot, template, catalog)`.
    `reconcile` builds an `itemsById` map, drops any map entry whose item id is absent from
    the catalog or fails `fits(item, spot)`. `CURRENT_VERSION = 2`.
  - `index.ts` exports the types, `fits`, `migrate`, `reconcile`, `CATALOG`,
    `catalogItemById`, template helpers, `coerceSnapshot`.
- `apps/mobile`
  - `features/studio/ui/item-picker.tsx` → `import { CATALOG, fits }`; renders
    `CATALOG.filter(item => fits(item, spot))` as a grid.
  - `features/studio/ui/art.ts` → static `ART: Record<id, require(...png)>` + `artSource(id)`
    and `ART_HIT_BOXES` (build-time transparency boxes). This is the tight coupling. The
    hit-box shape is `ArtHitBox = { size: {width,height}, opaqueBounds: {x,y,width,height} }`
    in **source pixels**; `hitTargetStyle` (`ui/spot-layer.tsx`) scales `opaqueBounds` by
    `frame/size`, so it depends on the source aspect ratio, not just a normalized box.
  - `features/studio/ui/placeholder.ts` builds the `ContentPresentation` (art + hitBox + label
    color) consumed by `spot-layer` for the rendered room. It resolves art by **id** today
    (`artSource(id)`/`artHitBox(id)`); this is the real render-path consumer that must become
    item-aware, alongside `item-picker.tsx`. Labels come from `itemLabel(id)` (a build-time
    id→label heuristic), which produces garbage for arbitrary admin ids.
  - `features/studio` state is the **legacy** shape (`state/atoms.ts`,
    `studio-provider.tsx`, `studio-sync.tsx`), MMKV-keyed by ownerId; not the `_atoms/` split.
    `state/atoms.ts` also reconciles every persisted snapshot against the static `CATALOG` inside
    `decorationAtom`; this consumer must move to the dynamic catalog or an admin-added item will be
    removed immediately after assignment and hidden/deleted items will not follow server state.
  - API: `GET/PUT /api/studio/room` in `lib/api/client.ts`.
  - No ownership concept: all items always available.
  - **Styling is NativeWind** (`className`), migrated in commit `feat(mobile): migrate
    styling to NativeWind`. `item-picker.tsx` and `spot-layer.tsx` are `className`-based today.
    New catalog UI and any edits here must use NativeWind to match — the older "StyleSheet
    only / no NativeWind" guidance in CLAUDE.md predates this migration and is stale.
  - Render path resolves the item from the **static `CATALOG`** via
    `describeContent(ref) → catalogItemById(ref.id)` (studio-core). `describeContent` in
    `placeholder.ts` therefore takes a bare `ContentRef` today; making it dynamic-catalog-aware
    changes its signature and ripples to its callers (`spot-layer.tsx`, `StudioStage`) and their
    tests — see §7.
- `apps/server`
  - Modules: `health`, `user`, `studio`, `admin`, `dev` (dev-only). `admin` guarded by
    `app.requireAdmin` (`app_metadata.role === "admin"`); users by `app.authenticate`. Routes
    mount under prefixes in `app.ts` (`/api/studio`, `/api/admin`); handlers use bare paths
    (e.g. `app.get("/room")`).
  - `studio/routes.ts` imports `CATALOG` and calls `reconcile` at **three** call sites, all of
    which must be rewired: `GET /room` and `PUT /room` call it directly, and `buildExploreRoom`
    calls it once — that single call serves **two** routes, `GET /rooms` (feed) and
    `GET /rooms/:ownerId` (visit). So it is 3 code edits covering 4 routes; missing the
    `buildExploreRoom` edit would silently drop admin items from other users' rooms.
  - Admin panel is `apps/admin` (Vite + react-admin 5) talking to `/api/admin/*` via the
    simple-rest protocol.
- Database: `profiles`, `studio_rooms` (`owner_id` unique, `version`, `template_id`,
  `map jsonb`). No catalog/items/ownership tables. No storage buckets in use.

## 2. Target architecture

```
Admin (react-admin)  ──/api/admin/catalog*──►  Fastify (secret key)  ──►  Postgres: catalog_items
      │  image upload (multipart)                     │  sharp: validate+cap+webp+hitbox
      └────────────────────────────────────────────► └──────────────►  Supabase Storage: catalog-art (public)

Mobile  ──/api/studio/catalog──►  Fastify getCatalog() [cache]  ──►  catalog_items (published)
   catalogAtom (atomWithQuery + MMKV persist)                            │
   item-picker reads catalogAtom                                         └─ reconcile() uses same loader
   expo-image: art_url (remote, cached); item stays hidden while art_url is null

studio-core: reconcile(snapshot, template, catalog) UNCHANGED — catalog now sourced from DB
```

## 3. Data model

### 3.1 `catalog_items` (new — source of truth)

```
id            text primary key           -- keep existing ids ("big-screen", ...)
tags          jsonb        not null       -- { type, size, ... } drives fits()
display_name  text         not null
art_url       text                        -- null until an admin uploads art
art_hitbox    jsonb                       -- ArtHitBox: { size:{width,height}, opaqueBounds:{x,y,width,height} }
                                          --   in source pixels; null = full-frame tap. Matches the mobile
                                          --   ArtHitBox contract so hitTargetStyle works unchanged.
blurhash      text                        -- reserved seam; NOT computed or served in Phase 1 (see §5.5 / §7)
status        text         not null default 'draft'   -- 'draft' | 'published'
access        text         not null default 'free'    -- 'free' | 'premium'  (economy seam)
price         integer                     -- null in Phase 1 (economy seam)
sort_order    integer      not null default 0
created_at    timestamptz  not null default timezone('utc', now())
updated_at    timestamptz  not null default timezone('utc', now())  -- set_updated_at trigger
```

- Seed migration inserts the 39 `CATALOG` items: `id`, `tags`, a `display_name`, `art_url = null`,
  `art_hitbox = null`, `status = 'published'`, `access = 'free'`. They stay out of the public
  catalog until art is uploaded through admin.
- **The seed SQL is GENERATED from `packages/studio-core/src/catalog.ts`, never hand-typed.** Write a
  small one-off Node script (or inline generation step) that reads `CATALOG` and emits the
  `insert ... values (...)` rows — `id` + `tags` straight from the source, and `display_name` from
  `defaultItemLabel(id)` **imported from `studio-core`** (the same helper mobile uses — see §4), so the
  two never drift. Importing the shared helper rather than reimplementing the heuristic in the generator
  is what guarantees no drift. Generating (rather than transcribing) is what keeps the seed in exact
  sync with the source: the row count and every `display_name` follow `catalog.ts` automatically, so the
  count can never be wrong by hand.
  Commit the generated SQL as the migration body; the generator is a dev convenience, not a runtime
  dependency.
- **Rationale for seeding at all (no users yet):** the data-preservation motive is moot pre-launch,
  but once mobile reads the catalog from `GET /api/studio/catalog` the item-picker is empty against an
  empty table — so the app needs a non-empty published catalog to be usable. Seeding from `catalog.ts`
  gives a working app immediately *and* keeps the 23 bundled-art fast paths live (ids match), while
  still leaving the upload pipeline fully testable by adding brand-new items or overriding a legacy
  item's `art_url` via admin.
- `check` constraints on `status`/`access` enum values.
- RLS: enable RLS; **no** anon/user policies needed because all access goes through the
  server secret-key client (which bypasses RLS). Document this explicitly. Do not add
  client-writable policies.
- Index: `(status, sort_order)` for the published listing.

### 3.2 `user_items` (designed now, created in Phase 2 — economy seam)

```
user_id     uuid  references auth.users on delete cascade
item_id     text  references catalog_items(id) on delete cascade
source      text  not null   -- 'default' | 'purchase' | 'grant'
acquired_at timestamptz not null default timezone('utc', now())
primary key (user_id, item_id)
```

Inert in Phase 1. Documented here so `catalog_items` fields (`access`, `price`) are shaped
correctly up front and Phase 2 is additive.

### 3.3 Storage

- Bucket `catalog-art`, **public**. Object key: `catalog-art/<itemId>/<contenthash>.webp`.
- A `public` bucket serves reads through the public URL with no `storage.objects` SELECT policy;
  writes go through the secret-key client (bypasses RLS), so no write policy is needed either.
- **Resolved:** define the bucket declaratively in `supabase/config.toml` and create/sync it with
  the Supabase CLI's one-time `supabase seed buckets` step. Current Supabase guidance treats Storage
  metadata rows as read-only and specifically recommends config-driven bucket definitions, so the
  database migration does not insert directly into `storage.buckets`. Running the bucket seed against
  the linked project remains an external-state action and requires explicit approval.

### 3.4 Catalog versioning

- Server derives a `version` that moves on **every** mutation including deletes. `max(updated_at)`
  alone is insufficient: a hard-delete leaves the surviving rows' `updated_at` unchanged, so
  mobile would never refetch and would keep a removed item in its MMKV cache. **Chosen approach: a
  dedicated single-row `catalog_meta(version bigint)`** bumped by a `set_updated_at`-style trigger
  on `catalog_items` insert/update/delete — a strictly monotonic value that also moves on delete.
  This same single-row read doubles as the cheap server-side cache-freshness check in §5.1.
- Mobile stores it; a change → react-query refetch (also driven by `staleTime`). Immutable
  content-hash image URLs mean per-image cache-busting is automatic; no separate per-image
  version needed.

## 4. `packages/studio-core` changes

Extend `CatalogItem` with **optional** fields only (backward-compatible; existing seed data
and all current tests stay valid; `fits`/`migrate`/`reconcile` untouched):

```ts
// Mirror the mobile ArtHitBox contract so uploaded art hit-tests accurately.
// size = processed image pixels (carries the aspect ratio that
// hitTargetStyle needs for the `contain` offset); opaqueBounds = opaque region
// in those same source pixels. Omit `hitbox` to make the whole rendered image
// tappable.
export interface ArtHitBox {
  size: { width: number; height: number };
  opaqueBounds: { x: number; y: number; width: number; height: number };
}

export interface CatalogItem {
  id: string;
  tags: Tags;
  name?: string;
  art?: { url: string; hitbox?: ArtHitBox };
}
```

- **Keep the domain type minimal.** `fits`/`reconcile` use only `id` + `tags`; the render/picker
  path additionally needs `name` + `art`. Publishing/economy fields (`status`, `access`, `price`)
  do **not** belong on the domain `CatalogItem` — they are not domain concerns and adding them
  leaks publishing/economy state into a package that must stay platform- and concern-neutral
  (AGENTS.md: "keep shared packages platform-neutral / minimal"). Put them on `CatalogItemDTO` in
  `packages/types` (§7) instead. The server loader already filters to `status = 'published'` and
  Phase 2 ownership is enforced server-side, so mobile/domain never need to read those fields.
  The published-catalog loader returns this DTO shape. Because `CatalogItemDTO` is structurally a
  superset of `CatalogItem`, the same array can be passed directly to `fits`/`reconcile` without
  leaking publishing or economy fields into the domain package.
- Keep `CATALOG` exported — it becomes (a) the DB seed source and (b) the mobile offline
  fallback for a first-ever cold start with no network.
- **Move the pure default-label heuristic into `studio-core`.** Today `itemLabel(id)` (kebab→Title:
  `id.replace(/-/g, " ").replace(/\b\w/g, upper)`) lives in `apps/mobile/.../ui/placeholder.ts`, so the
  seed generator (which reads `studio-core`, not mobile) cannot import it — reimplementing it in the
  generator is the exact drift the §3.1 "generate, don't transcribe" rule exists to prevent. Export a
  pure `defaultItemLabel(id: string): string` from `studio-core` (platform-free string transform, no
  art/RN — belongs there). Then **both** consumers use the one source: the seed generator maps
  `display_name = defaultItemLabel(id)`, and mobile's `placeholder.ts` re-exports it as `itemLabel`
  (keeping the current call sites `spot-layer.tsx` / `item-picker.tsx` unchanged). Seed metadata
  remains available for safe offline reconciliation, but items without uploaded art stay hidden.
  Existing `itemLabel` tests move/mirror to `studio-core` and stay green.
- `exactOptionalPropertyTypes` is on: the DB-row → `CatalogItem` mapping (server loader and
  mobile DTO mapping) must conditionally spread optional fields
  (`...(url ? { art: { url, ...(hitbox ? { hitbox } : {}) } } : {})`) — never assign `undefined`.
- The mobile `ArtHitBox` in `features/studio/ui/art.ts` should re-export / align with this shared
  type so both bundled and remote art flow through one shape.
- Add tests asserting the extended type is optional (existing `reconcile`/`fits` tests must
  remain green unchanged).

## 5. Server changes (`apps/server`)

### 5.1 Shared catalog loader + cache

- `modules/catalog/service.ts`: `getCatalog(): Promise<CatalogItemDTO[]>` reads published
  `catalog_items`, maps rows to the shared wire DTO (folding `display_name` into `name` and
  `art_url`/`art_hitbox` into `art`, while retaining `status`/`access`/`price`). The DTO is a
  structural superset of the domain `CatalogItem`, so studio routes pass the returned array
  directly to `reconcile` without a second projection.
- **In-memory cache with short TTL** (e.g. 30–60s) plus explicit invalidation on any admin
  write. Rationale: `reconcile` now depends on the catalog and must not hit the DB on every
  `GET/PUT /api/studio/room`.
- **Multi-instance staleness (the deploy target may run >1 replica).** An in-memory cache with
  invalidate-on-write only clears the replica that handled the write; other replicas keep a stale
  cache until TTL. For read paths this is acceptable. For the **write path** (`PUT /room`) it is
  not fully safe: a replica whose warm cache predates a just-published item could reconcile that
  item away and persist the loss — the exact failure §5.1's write-path rule exists to prevent.
  Mitigation: before trusting a cached catalog for reconcile, read the single-row
  `catalog_meta.version` (cheap) and reload the full catalog only when it differs from the cached
  version. This closes the cross-replica window at ~one trivial query per reconcile instead of a
  full catalog fetch. Apply it to authoritative sync/write paths; render-only Explore reads may
  skip it and rely on TTL.
- **Fail-safe (render-only read path)**: if the DB read fails and no cache is warm, Explore
  rendering (`GET /rooms`, `GET /rooms/:ownerId`) must not wipe the rendered room. Fall back to
  last-known cache; if none, fall back to the bundled `CATALOG` seed rather than reconciling
  against an empty catalog. `GET /room` is excluded because mobile persists that response and may
  later push it back; it must return `503` when an authoritative catalog cannot be loaded.
- **Fail-safe (write path)**: on `PUT /room`, reconcile output is **persisted**. Reconciling
  against the bundled seed (which lacks all admin items) would strip admin placements and write
  the loss to the DB. So on `PUT`, if the catalog cannot be loaded fresh (or from a warm cache),
  do **not** fall back to the bundled seed — fail the request with `503`
  (`app.httpErrors.serviceUnavailable`) so the client can retry without data loss.

### 5.2 Public catalog endpoint (mobile)

- `GET /api/studio/catalog` (preHandler: `app.authenticate`)
  → `ApiSuccess<{ version: number; items: CatalogItemDTO[] }>`, published only.
- This endpoint is authoritative client state. Return `503` when the current catalog version cannot
  be loaded; never return a bundled fallback as a successful response that mobile would persist.
- Phase 2: include an `owned` flag per item once `user_items` exists.

### 5.3 studio route wiring

- Replace `import { CATALOG }` in `modules/studio/routes.ts` with the cached loader at **all
  three** reconcile call sites: `GET /room`, `PUT /room`, and `buildExploreRoom` (the single
  call that powers both `GET /rooms` and `GET /rooms/:ownerId`). `buildExploreRoom` becomes async
  or takes the loaded catalog as an argument (fetch the catalog once per request, then map rows)
  — do not call the loader per row.
- Apply the fail-safe split from §5.1: Explore render-only reads may use the bundled fallback;
  authoritative `GET /room` and `PUT /room` must return `503` rather than persist or synchronize a
  lossy reconcile.
- Economy seam (Phase 2): before persisting a `PUT`, reject/strip map entries whose item is
  `premium` and not owned by the caller. Phase 1: all free → no-op.

### 5.4 Admin catalog CRUD (react-admin simple-rest)

Mirror the existing admin module contract (range/sort/filter + `Content-Range`):

- `GET /api/admin/catalog` — list (paginated, sortable, searchable by name/tag/status).
- `GET /api/admin/catalog/:id` — detail.
- `POST /api/admin/catalog` — create (id, tags, display_name, status, access, sort_order).
  The `id` is an **admin-authored text PK**: validate it as a kebab-case slug
  (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`) to match the existing id convention, and on a duplicate key
  return `409` (`app.httpErrors.conflict`), never a bare `500`. Item is created **without art**;
  art is attached afterward via the separate upload endpoint (see §6 ordering).
- `PATCH|PUT /api/admin/catalog/:id` — update allowlisted fields.
- `DELETE /api/admin/catalog/:id` — delete (consider soft-guard: warn if referenced; MVP can
  hard-delete since reconcile already drops missing ids).
- `POST /api/admin/catalog/:id/art` — **multipart** image upload (see 5.5).
- All under `fastify.requireAdmin`. Invalidate the catalog cache on every mutation.
- Zod schemas for body/params; tag input validated as `Record<string, string | string[]>`.

### 5.5 Image upload pipeline (`sharp`)

- Deps: `sharp` is preflighted early because its platform binary must load on local and Railway
  runtimes. Add `@fastify/multipart` as an `@bnewapp/server` dependency in the same implementation
  change that registers the plugin and adds the upload route; do not leave it unused or hand-hoist it.
- Accept: single file, mime sniffed (PNG/WEBP/JPEG), input ≤5MB, ≤4096px.
- Process with sharp:
  1. Cap to ~1024px long edge (only downscale; never upscale).
  2. Re-encode → WEBP (q≈80), strip metadata.
  3. From the **processed** image, record its pixel `size` ({width,height}) and the alpha
     bounding box in those pixels → `art_hitbox = { size, opaqueBounds }` matching the mobile
     `ArtHitBox` contract (§4). When the image has no alpha, set `opaqueBounds` to the full frame
     (`{ x:0, y:0, width, height }`). `size` is required (it carries the aspect ratio
     `hitTargetStyle` needs); do **not** collapse this to a bare normalized `{x,y,w,h}`. Do not
     auto-trim/crop the pixels — keep the padding for composition and let `opaqueBounds` describe
     the tap region without cropping the visible composition.
     - Compute `opaqueBounds` **without mutating the stored image**: run the alpha analysis on a
       throwaway clone. Either (a) `sharp(processed).trim({ threshold })` and derive the box from
       `info.trimOffsetLeft/Top` + the trimmed `width/height`, or (b) extract the raw alpha channel
       (`.ensureAlpha().raw()`) and scan for the min/max x/y of pixels above an alpha threshold —
       (b) is the robust path when soft shadows make `trim` heuristic. Keep a small margin for soft
       shadows. The uploaded/stored bytes
       remain the full padded WEBP from step 2.
  4. **`blurhash` is NOT computed in Phase 1.** The column exists as a seam only (§3.1); Phase 1 does
     not generate it, the DTO does not carry it (§7), and mobile does not read it — so nothing is
     stored-but-unused. Wiring it later is additive: compute here, add the field to `CatalogItemDTO`,
     and feed it to `expo-image`'s `placeholder`. Left out now per YAGNI (same as thumbnails).
- Filename = content hash of the processed bytes → `catalog-art/<id>/<hash>.webp`.
- Upload via secret-key client with `cacheControl: '31536000, immutable'`, `upsert: false`.
- Set `catalog_items.art_url` (public URL) + `art_hitbox`, bump `updated_at`, invalidate cache.
- Orphan cleanup: replacing art leaves the old hashed object orphaned. Leave it (cheap);
  optional janitor later. Do **not** delete synchronously (clients may still be caching it).

## 6. Admin panel changes (`apps/admin`)

- New react-admin `<Resource name="catalog">` driven by the existing `simpleRestProvider`
  (`ra-data-simple-rest`) for CRUD only:
  - **List**: Datagrid with thumbnail when `art_url` exists, display_name, type
    tag, status, access, sort_order; searchable + sortable + paginated.
  - **Create**: fields for id (slug), display_name, tags (type/size + free-form), status
    (draft/published), access (free/premium), sort_order. **No image upload on Create** — the
    art endpoint (`/api/admin/catalog/:id/art`) needs the row to exist first. After create,
    redirect to Edit to attach art.
  - **Edit**: same fields **plus** the image-upload control (below), previewing the result +
    detected hit-box.
  - Guidance text: tags must match a spot accept rule to be placeable in-app (list the
    valid `type` values).
- **Image upload is a custom control, NOT the data provider.** `simpleRestProvider` +
  `httpClient` (`fetchUtils.fetchJson`) only send/parse JSON, so multipart cannot flow through
  react-admin's normal create/update. The control must call `httpClient` (the one exported from
  `apps/admin/src/lib/data-provider.ts` — note the real name is `httpClient`, there is no
  `adminFetch`) with a `FormData` body and **must not set a JSON `Content-Type`** (let the browser
  set the multipart boundary). On success it refetches the record so the new `art_url`/hit-box
  preview updates. Reuse the existing Supabase Bearer auth + 401-refresh path already in
  `httpClient`; no new auth model.
- CORS: the API already exposes `Content-Range` and allows `POST`; verify no extra exposed header
  is needed for the multipart response (it returns the standard `ApiSuccess<T>` JSON).

## 7. Mobile changes (`apps/mobile`)

- **Styling: NativeWind (`className`)**, not StyleSheet — the mobile app was migrated to
  NativeWind (see §1). New `features/catalog/` UI and every edit to `item-picker.tsx` /
  `spot-layer.tsx` / `placeholder.ts` render code follows the surrounding `className` idiom.
  **Governance blocker:** the root `CLAUDE.md` §7 still says "Use StyleSheet / NativeWind is not
  part of the build contract". That guidance is stale and contradicted by both the shipped code
  (`nativewind@^4.2.6`, `babel.config.js` `jsxImportSource: "nativewind"`, `tailwind.config.js`, all
  components use `className`, zero `StyleSheet`) and the already-correct
  `apps/mobile/AGENTS.md`. Because `CLAUDE.md` is an overriding instruction, a plan note is not
  enough to neutralize it — the root doc itself must be updated (see build order Phase 1, step 0b)
  or future contributors will follow the wrong rule.
- **New feature `features/catalog/`** on the go-forward atomic-split standard (studio stays
  legacy; do not copy its shape):
  - `_atoms/queries.ts`: `catalogAtom = atomWithQuery(GET /api/studio/catalog)`, using the
    shared `QueryClient` + query-auth atom (`{ userId, accessToken }`), key includes
    `userId`. **Persist to MMKV** (namespace `catalog:v1:`, per-feature `new MMKV({ id: "catalog" })`)
    for instant cold start + offline; refetch on `version` change / staleTime. Keying by
    `userId` duplicates identical global catalog JSON per user in MMKV — intentional, and
    forward-looking for Phase 2 when `owned` makes the payload user-scoped.
  - **Synchronous, never-suspends render contract (this is the crux of the render path).** The
    read-only room renderer (`StudioStage` → `SpotLayer` → `describeContent`) runs `reconcile`-style
    lookups **inside render** and must never suspend or see an empty catalog. Guarantee this by giving
    `catalogAtom` **`initialData` read synchronously from MMKV**, and when MMKV is empty (first-ever
    cold start) fall back to the bundled `CATALOG` from `studio-core`. Because `initialData` is always
    present and non-empty, `atomWithQuery` reports `success` immediately — reading it never throws a
    pending promise — while it still refetches in the background and writes fresh results back to MMKV
    (`onSuccess`/effect). This satisfies the CLAUDE.md rule "do not copy query results into a second
    plain atom": the query atom stays the single source of truth; MMKV is its persister and
    `catalogItemByIdAtom` is a derived selector, not a duplicate.
  - Derived `catalogItemByIdAtom` (Map: id → item) for lookups, derived from `catalogAtom`'s
    (always-defined) data; defensively fall back to the bundled `CATALOG` map if data is ever
    undefined, so consumers can read it synchronously without a guard.
  - `index.ts`: export `catalogAtom`, `catalogItemByIdAtom` (narrow public entry).
  - `api.ts`: typed `getCatalog(accessToken)` fetch fn.
- **`features/studio/state/atoms.ts`**: change `decorationAtom` to reconcile against the same
  synchronously available catalog data instead of the static `CATALOG`. Preserve the existing
  coerce → migrate → reconcile pipeline and MMKV write contract. This is required for correctness:
  assigning an admin-added item must survive the next atom read, while a catalog ref that becomes
  hidden or deleted must be removed consistently with server reconciliation. The bundled `CATALOG`
  remains only the first-cold-start/offline fallback supplied by the catalog feature.
- **`features/studio/ui/item-picker.tsx`**: read `catalogAtom` instead of the `CATALOG`
  import; keep `fits(item, spot)` filtering. Render the label from `item.name` (fall back to
  `itemLabel(item.id)` for legacy items) — `itemLabel(id)` alone yields garbage for arbitrary
  admin ids. **Suspense caveat:** because `catalogAtom` always has `initialData` (MMKV → bundled
  seed), there is no true pending-with-no-data state, so the picker does **not** need a Suspense
  *loading* fallback for the initial read — it renders immediately from cached/seeded data. Keep the
  shared **query error boundary + retry** to surface a hard refetch failure, and a **background-refetch
  indicator** for the in-flight refresh (per the mobile skill's "keep explicit loading UI for
  background refetches"). Keep the spot/auth guards above the boundary. The picker is a `Modal` inside
  the legacy studio provider, so scope any boundary to the grid, not the whole studio screen.
- **`features/studio/ui/art.ts` + `features/studio/ui/placeholder.ts`** → remote-only resolver.
  `placeholder.ts` (which builds the `ContentPresentation` consumed by `spot-layer` for the
  rendered room) is the real render-path consumer; make both item-aware. **This changes
  `describeContent`'s signature** — today it takes a bare `ContentRef` and resolves the item from
  the static `CATALOG` via `catalogItemById(ref.id)`; it must instead receive the resolved
  `CatalogItem` (or the dynamic catalog map). That ripples to its callers (`spot-layer.tsx`'s
  `SpotLayer`, and `StudioStage` in edit/preview/visit modes) and their tests — update those in
  the same change. Content without uploaded art has no visual fallback and renders as empty.
  **`describeContent` stays a pure synchronous function** — it receives the already-resolved item and
  never reads an atom or awaits; the caller (`SpotLayer`/`StudioStage`) resolves it synchronously via
  `useAtomValue(catalogItemByIdAtom)` (guaranteed non-suspending per the render contract above) and
  passes it in. For a `source:"video"` ref there is no catalog item — pass `undefined` and take the
  video branch. Change callers to pass the item rather than just the id:
  - `art = item.art?.url ? { uri: item.art.url } : null`; null renders as empty.
  - Hit-box: uploaded items use `item.art.hitbox` (already the `ArtHitBox` shape from the DTO) if
    present; otherwise omit it so the whole rendered image is tappable.
  - `spot-layer.tsx`/`hitTargetStyle` stay unchanged — they receive the same `ArtHitBox` shape
    regardless of source.
  - The rendered room resolves art from the catalog atom, so a **visited** room containing a
    brand-new admin item needs that item in the viewer's cached catalog; acceptable per the
    offline risk below (one online fetch resolves it).
- **Perf**: `Image.prefetch()` the visible published art after catalog load; rely on
  expo-image disk cache (immutable URLs). Keep the bundled `CATALOG` from studio-core as the
  ultimate offline fallback when the query has no cached data.
- **DTOs** (`packages/types`): add `CatalogItemDTO` (including the `ArtHitBox`-shaped
  `art.hitbox`) and the `GET /api/studio/catalog` response shape
  (`ApiSuccess<{ version: number; items: CatalogItemDTO[] }>`); reuse in both the mobile api fn
  and the server route types. `CatalogItemDTO` is a **structural superset** of `studio-core`'s
  `CatalogItem`: it carries the domain fields (`id`, `tags`, `name?`, `art?`) plus the
  publishing/economy fields that live here rather than in the domain type (`status`, `access`,
  `price?` — see §4). Phase 1 mobile ignores `status`/`access`/`price`; they exist on the DTO now
  so Phase 2 (`owned`, lock badges) is additive. The loader owns this DB-row → DTO projection;
  domain consumers rely only on the `CatalogItem` subset of each DTO.

## 8. Build order

### Phase 1 — dynamic admin-managed catalog (build now)

0. **Deps**: Deploy target is **Railway** (glibc x64, confirmed) — `sharp` prebuilt is viable, no
   compile. Add `sharp` (>=0.33) as an `@bnewapp/server` dep; do not hand-hoist.
   Verify the build on **both** the local dev platform (darwin arm64 → `@img/sharp-darwin-arm64`, loads
   under Vitest) and a Railway build (→ `@img/sharp-linux-x64`): confirm the pnpm install keeps
   `sharp`'s optional platform package (no `--no-optional`, no bad hoist under `node-linker=hoisted`).
   `sharp` >=0.33 has no postinstall build, so **no `onlyBuiltDependencies` entry is needed**. Do this
   first so the upload pipeline in step 4 has a working native dep.
0b. **Docs governance fix**: update root `CLAUDE.md` §7 to remove the stale "Use StyleSheet /
   NativeWind is not part of the build contract" rule and align it with the already-correct
   `apps/mobile/AGENTS.md`: static mobile styling uses NativeWind (`className`). Do this before (or
   in the same change as) any new mobile UI so the overriding instruction matches the shipped code
   (§7).
1. **Migration**: `catalog_items` (+ enums, index, RLS-on-no-policies note) + `catalog_meta`
   single-row version counter (trigger-bumped on insert/update/delete, mirroring `set_updated_at`)
   + seed 39 items **generated from `CATALOG`** (a dev script emits the `insert` rows; never
   hand-typed — see §3.1). Define `catalog-art` in `supabase/config.toml` and sync it with the
   approval-gated `supabase seed buckets --linked` step (§3.3). Review SQL. `db:push` + `db:types`
   **only after explicit approval**, then commit `database.generated.ts`.
2. **studio-core**: extend `CatalogItem` with **domain-only** optional fields (`name`, `art`);
   keep `status`/`access`/`price` OUT of the domain type (§4); keep `CATALOG` seed; **add
   `defaultItemLabel(id)`** (pure, shared by the seed generator and mobile — §4/§3.1) and move its
   test here; keep tests green.
3. **types**: add `CatalogItemDTO` (domain fields + `status`/`access`/`price`) + catalog response
   shape.
4. **server**: add and register `@fastify/multipart` with the upload implementation; catalog loader
   + cache + read/write fail-safe + `catalog_meta.version` freshness
   check on the write path (§5.1); delete-aware catalog `version`; `GET /api/studio/catalog`;
   rewire the **three** studio reconcile call sites (`GET /room`, `PUT /room`, and
   `buildExploreRoom` — the latter serving both `GET /rooms` and `GET /rooms/:ownerId`) to the
   loader; admin catalog CRUD (slug-validated `id`, `409` on
   duplicate, invalidate cache on every mutation); `sharp` upload pipeline (+ multipart) producing
   the `ArtHitBox`-shaped `art_hitbox` on a non-mutating alpha clone (§5.5).
5. **admin**: catalog resource via `simpleRestProvider` (list/create/edit, **no art on create**)
   **plus** a separate custom multipart upload control on Edit (calls `httpClient` with `FormData`,
   no JSON `Content-Type`) with hit-box preview (§6).
6. **mobile**: `features/catalog` query atom with **`initialData` from MMKV seeded by the bundled
   `CATALOG`** so the render path never suspends / never sees an empty catalog (§7 render contract);
   derived `catalogItemByIdAtom` (Map) + background write-back to MMKV; item-picker reads the atom
   (no Suspense loading fallback — data is always seeded; keep error boundary + background-refetch
   indicator); `decorationAtom` reconciles against that same dynamic catalog rather than static
   `CATALOG`; remote-only art resolver via the new **pure synchronous** `describeContent(ref, item?)`
   signature, callers resolve the item via `useAtomValue(catalogItemByIdAtom)`; prefetch published
   art. Re-export `defaultItemLabel` from `studio-core` as `itemLabel`. NativeWind (`className`) styling.
7. **tests**:
   - studio-core: unchanged reconcile/fits suites stay green.
   - server: catalog list/CRUD, admin auth (401/403), slug-invalid `id` → 400 and duplicate `id`
     → 409, reconcile against dynamic catalog on all four paths (room read/write + explore
     feed/visit), cache invalidation, `catalog_meta.version` freshness check reloads a stale cache
     before a `PUT` reconcile, delete bumps `version`, upload validation (bad mime/oversize) +
     `art_hitbox` shape (incl. no-alpha → full-frame bounds), read-path fail-safe (failed catalog
     does not wipe rendered rooms), write-path fail-safe (`PUT` returns 503 instead of persisting a
     lossy reconcile).
   - mobile: picker renders only uploaded art with `item.name` labels; no-art items stay hidden,
     remote-item hit-box resolves to `ArtHitBox`, offline cached-catalog render;
     assigning an admin-added item survives `decorationAtom` reconciliation; hiding or deleting an
     item removes its placement through the same reconciliation path; the bundled fallback still
     reconciles legacy placements while offline;
     **first-ever cold start with empty MMKV renders from the bundled `CATALOG` seed without
     suspending** (initialData render contract); `describeContent` is pure given a resolved item and
     takes the video branch when the item is `undefined`.
   - Device verification of the picker + placement per the mobile skill.
8. Run `corepack pnpm typecheck && test && lint`.

### Phase 2 — economy (seams ready, additive)

- Create/wire `user_items`; add `price`/currency semantics; purchase endpoint.
- Server enforces ownership on `PUT /api/studio/room` and in reconcile (strip unowned
  premium); include `owned` in `GET /api/studio/catalog`.
- Mobile: lock badges on premium items in the picker, buy flow, owned filtering.

## 9. Risks & mitigations

- **reconcile now depends on DB catalog** → in-memory cache + split fail-safe: **reads** fall
  back (last cache → bundled seed) so a catalog outage never empties rendered rooms; **writes**
  (`PUT /room`) 503 instead of persisting a reconcile against an incomplete catalog, so a
  transient outage can never strip admin placements from a saved room. Both covered by tests.
- **multi-instance cache staleness (multiple replicas)** → a write-handling replica invalidates
  only its own in-memory cache, so another replica could reconcile a `PUT` against a stale catalog
  that predates a just-published item and persist the loss. Mitigated by the `catalog_meta.version`
  freshness check on the write path (§5.1): one cheap single-row read revalidates the cache before
  reconcile, reloading only on a version change. Covered by test.
- **stale mobile cache after a delete** → the catalog `version` is derived to move on delete
  (trigger-backed counter, not bare `max(updated_at)`), so a removed item drives a refetch and
  drops from the picker; reconcile independently drops any now-missing id at render time.
- **New server native dep (`sharp`)** → deploy target is **Railway (glibc x64, confirmed)**, so
  prebuilt `@img/sharp-linux-x64` applies with no compile and no postinstall (`sharp` >=0.33 → no
  `onlyBuiltDependencies` entry). Residual check only: ensure the Railway `pnpm install` keeps the
  optional platform package (no `--no-optional`, no bad hoist under `node-linker=hoisted`); the local
  darwin build uses `@img/sharp-darwin-arm64` and each platform's binary is fetched fresh because
  Railway installs on its own image.
- **Railway horizontal scaling (>1 replica)** → if the service ever runs multiple replicas, the
  in-memory catalog cache can diverge across them; the `catalog_meta.version` freshness check on the
  write path (§5.1) is what keeps a `PUT` reconcile from persisting against a stale replica cache.
  Keep it even though Railway defaults to a single replica.
- **Offline for brand-new remote items** → acceptable; catalog JSON in MMKV + expo-image disk
  cache + bundled fallback cover the common paths. New items simply require one online fetch.
- **Render path suspending / empty catalog on cold start** → prevented by the `catalogAtom`
  `initialData` contract (§7): MMKV-seeded, bundled-`CATALOG` fallback when MMKV is empty, so the
  query is never pending-with-no-data and `StudioStage`/`SpotLayer` always resolve items synchronously.
  Covered by the cold-start test above.
- **Premium art is public in Phase 2** → ownership is enforced server-side at placement, not
  by hiding the asset URL. Documented as an intentional decision.
- **Tag/spot mismatch by admin** → an item whose tags match no spot accept rule is simply
  never offered; admin UI surfaces the valid `type` values as guidance.

## 10. Out of scope

- Real-money IAP / receipt verification.
- Multiple room templates or admin-authored templates/spots.
- Responsive image sizes, thumbnails, on-the-fly transforms.
- Bulk-uploading the old bundled assets. They remain in the repository but are not a runtime
  fallback; art is added item-by-item through the admin upload flow.

## 11. Implementation checklist (tracking)

Granular, orderable checkboxes per phase. Ordering fixes from review are baked in:
resolve the bucket path **first** (P1.0), and add `defaultItemLabel` to `studio-core`
**before** generating the seed SQL (P1.1a precedes P1.2b).

### Phase 1 — dynamic admin-managed catalog

**P1.0 — Pre-flight blockers (do first)**

- [x] Confirm deploy target `sharp` story: pin `sharp` >=0.33; verify no `onlyBuiltDependencies`
      entry required (prebuilt `@img/*`, no postinstall).
- [x] **Resolve `catalog-art` bucket creation path**: define it in `supabase/config.toml` and use
      the documented one-time `supabase seed buckets` command (approval-gated for the linked project),
      avoiding direct writes to Supabase-managed Storage metadata tables.
- [x] Add `sharp` (>=0.33) as an `@bnewapp/server` dep (no hand-hoist).
- [x] Verify install keeps the optional platform binary on dev (darwin arm64 →
      `@img/sharp-darwin-arm64`, loads under Vitest); no `--no-optional`, no bad hoist under
      `node-linker=hoisted`.
- [ ] Verify the deploy image keeps and loads `@img/sharp-linux-x64` in a Railway build.

**P1.0b — Docs governance**

- [x] Update root `CLAUDE.md` §7 to remove the stale "StyleSheet only / NativeWind not in build
      contract" rule and align it with the existing NativeWind guidance in `apps/mobile/AGENTS.md`.

**P1.1 — studio-core (domain first, unblocks the seed generator)**

- [x] Add shared `ArtHitBox` type + extend `CatalogItem` with **domain-only** optionals
      (`name?`, `art?`); keep `status`/`access`/`price` OUT of the domain type.
- [x] **P1.1a — Add pure `defaultItemLabel(id): string`** to `studio-core` (kebab→Title); export it.
      *(Must land before P1.2b — the seed generator imports it.)*
- [x] Keep `CATALOG` exported (DB seed source + mobile offline fallback).
- [x] Move/mirror the `itemLabel` heuristic test into `studio-core`; keep `reconcile`/`fits` suites green.

**P1.2 — Database migration**

- [x] `catalog_items` table (`check` on `status`/`access`; index `(status, sort_order)`;
      enable RLS with **no** client policies + documented rationale).
- [x] `catalog_meta` single-row version counter + trigger on `catalog_items`
      insert/update/**delete** (mirror `set_updated_at`), strictly monotonic.
- [x] `catalog-art` bucket per the P1.0 decision (`supabase/config.toml`; one-time seed is approval-gated).
- [x] **P1.2b — Seed the 39 items GENERATED from `CATALOG`** via a dev script that imports
      `defaultItemLabel` from `studio-core` (`id`+`tags` from source, `display_name =
      defaultItemLabel(id)`, `art_url=null`, `art_hitbox=null`, `status='published'`,
      `access='free'`). Commit generated SQL as the migration body; generator is dev-only.
- [x] Review SQL; apply it to `bnewapp(staging)` after explicit approval; run `db:types`; commit
      `database.generated.ts`.

**P1.3 — types**

- [x] Add `CatalogItemDTO` (structural superset: `id`,`tags`,`name?`,`art?` + `status`,`access`,`price?`).
- [x] Add `GET /api/studio/catalog` response shape `ApiSuccess<{ version: number; items: CatalogItemDTO[] }>`.

**P1.4 — server**

- [x] Add `@fastify/multipart` as an `@bnewapp/server` dependency and register it in the same
      change as the upload route; do not add it as an unused preflight dependency.
- [x] `modules/catalog/service.ts`: `getCatalog()` reads published rows → `CatalogItemDTO[]`
      (retain `status`/`access`/`price`; conditionally spread optional fields and never assign
      `undefined`). Pass this structural superset directly to domain `reconcile` call sites.
- [x] In-memory cache (TTL ~30–60s) + invalidate-on-write.
- [x] `catalog_meta.version` freshness check on the **write path** before trusting cache.
- [x] Read-path fail-safe (last cache → bundled seed; never wipe rendered rooms).
- [x] Write-path fail-safe (`PUT /room` returns **503**, never persist a lossy reconcile).
- [x] `GET /api/studio/catalog` (`app.authenticate`, published only).
- [x] Rewire **all 3** reconcile call sites to the loader: `GET /room`, `PUT /room`,
      `buildExploreRoom` (async / catalog passed in — fetch once per request, not per row).
- [x] Admin CRUD (`fastify.requireAdmin`, simple-rest range/sort/filter + `Content-Range`):
      list / detail / create / update / delete; slug-validate `id`
      (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`) → **400** on invalid, **409** on duplicate; invalidate
      cache on every mutation.
- [x] `POST /api/admin/catalog/:id/art` multipart pipeline (`sharp`): mime-sniff + size/dim caps
      → cap 1024px long edge → WEBP q≈80 strip metadata → `art_hitbox`={size,opaqueBounds} on a
      **non-mutating alpha clone** (no-alpha → full-frame bounds) → content-hash key
      `catalog-art/<id>/<hash>.webp` → upload (`cacheControl: 31536000, immutable`, `upsert:false`)
      → set `art_url`+`art_hitbox`, bump `updated_at`, invalidate cache. `blurhash` NOT computed.

**P1.5 — admin panel**

- [x] `<Resource name="catalog">` via `simpleRestProvider`: List (thumbnail, name, type, status,
      access, sort_order; searchable/sortable/paginated).
- [x] Create (id slug, name, tags, status, access, sort_order) — **no image upload**; redirect to
      Edit after create.
- [x] Edit: same fields + custom multipart upload control calling `httpClient` with `FormData`
      (**no JSON `Content-Type`**), refetch on success, hit-box + art preview.
- [x] Guidance text listing valid `type` values (spot accept rules).

**P1.6 — mobile**

- [x] `features/catalog/` (atomic-split): `catalogAtom = atomWithQuery` on shared `QueryClient` +
      query-auth atom, key includes `userId`.
- [x] **Render contract**: `initialData` read **synchronously** from MMKV (`catalog:v1:`, per-feature
      `new MMKV({ id: "catalog" })`); empty MMKV → bundled `CATALOG` fallback → atom never
      pending-with-no-data / never suspends; background refetch writes back to MMKV.
- [x] Derived `catalogItemByIdAtom` (Map, non-suspending; falls back to bundled map if undefined);
      `index.ts` narrow exports; `api.ts` typed `getCatalog(accessToken)`.
- [x] `state/atoms.ts`: make `decorationAtom` reconcile against the synchronously available dynamic
      catalog instead of static `CATALOG`; preserve coerce → migrate → reconcile and MMKV writes.
- [x] `item-picker.tsx`: read `catalogAtom` (drop `CATALOG` import), keep `fits`; label from
      `item.name` (fallback `itemLabel(id)`); **no Suspense loading fallback** (data always seeded);
      keep query error boundary + retry + background-refetch indicator scoped to the grid.
- [x] Change `describeContent` to **pure sync** `describeContent(ref, item?)`; caller
      (`SpotLayer`, resolved down from `StudioStage`) passes item via
      `useAtomValue(catalogItemByIdAtom)`; `source:"video"` → `item=undefined` → video branch.
- [x] Remote-only art resolver in `art.ts`/`placeholder.ts`: `item.art?.url` → remote, otherwise
      empty; hit-box = `item.art.hitbox` when present, otherwise omit. The picker excludes items
      without art, and `spot-layer.tsx` keeps only the remote-art and empty-spot branches.
- [x] Re-export `defaultItemLabel` from `studio-core` as `itemLabel` in `placeholder.ts`
      and remove the original type-color placeholder presentation.
- [x] `Image.prefetch()` visible published art after catalog load. NativeWind (`className`) styling.

**P1.7 — tests & verification**

- [x] studio-core: `reconcile`/`fits` suites green unchanged; `defaultItemLabel` test.
- [ ] server: catalog list/CRUD; admin auth 401/403; slug-invalid → 400, duplicate → 409;
      reconcile on all 4 paths (room read/write + explore feed/visit); cache invalidation;
      `catalog_meta.version` freshness reloads stale cache before a `PUT` reconcile; delete bumps
      version; upload validation (bad mime/oversize) + `art_hitbox` shape (incl. no-alpha →
      full-frame); read-path fail-safe (no room wipe); write-path fail-safe (`PUT` → 503).
- [x] mobile: picker renders from atom with `item.name`; uploaded remote art only;
      remote hit-box resolves to `ArtHitBox`; offline cached-catalog render; **first-ever cold start
      with empty MMKV renders from bundled `CATALOG` without suspending**; `describeContent` pure
      given resolved item + takes video branch when item `undefined`; admin-added placement survives
      `decorationAtom` reconciliation; hidden/deleted placement is removed; offline bundled fallback
      continues to reconcile legacy placements.
- [x] **Update the 12 existing `placeholder.test.ts` assertions** to the new
      `describeContent(ref, item?)` signature.
- [x] Device verification: picker + placement (per the mobile skill).
- [x] `corepack pnpm typecheck && test && lint`.

### Phase 2 — economy (seams ready, additive)

- [ ] Create + wire `user_items` (migration); default-grant rule for existing free items.
- [ ] Add `price`/currency semantics; purchase endpoint.
- [ ] Server: enforce ownership on `PUT /api/studio/room` + in reconcile (strip unowned premium);
      include `owned` per item in `GET /api/studio/catalog`.
- [ ] Mobile: lock badges on premium items, buy flow, owned filtering.
