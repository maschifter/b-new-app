# Plan: Inventory + Shop + Glow currency

## Context

Today users can place **any** published catalog item into their studio room — there is no
ownership, no currency, and no shop. We are turning item placement into a light game
economy:

- **Glow** = the in-app currency. Each user has a Glow balance (seeded high so it is
  effectively unlimited for now). Buying an item deducts its price.
- **Inventory** = the items a user owns (bought or granted). Some may not be placed in
  their room. Surfaced as a new **Inventory bottom tab**.
- **Shop** = a pushed screen opened **from the Inventory tab** (not its own tab). Renders
  all purchasable items with a horizontal **category** filter (reusing `tags.type`); tap to
  buy with Glow → item is added to inventory.
- The studio **item-picker is gated by ownership**: it only offers items the user owns.

Decisions locked with the user:
1. Studio picker gates on ownership (game economy).
2. Glow model **A**: real balance, seeded high (999,999), deducts on purchase, shown in UI.
3. Category filter = reuse existing `tags.type`.
4. **One** new bottom tab = Inventory; Shop is a route opened from it.
5. Starter grant = every user is granted all `published + free` items (+ items already placed
   in their room) so the inventory/picker is never empty.
6. Server does **not** yet enforce ownership on room save (`PUT /api/studio/room`) — gating is
   client-side only for now (noted as future hardening).

The `catalog_items` table already has `price` and `access` columns (unused seams) and the
mobile catalog fetch (`catalogAtom`) already exists — we reuse both.

---

## 1. Database — one new migration

Create `supabase/migrations/<ts>_create_economy.sql` (use `corepack pnpm db:new create_economy`).
Follow the existing style in `20260821183500_create_catalog_items.sql` (RLS enabled, **no
client policies** — all access via the server secret-key client; `set_updated_at` trigger).

```sql
-- Wallet: one row per user, Glow balance seeded high.
create table public.user_wallets (
  owner_id uuid primary key references auth.users on delete cascade,
  glow bigint not null default 999999,
  starter_granted boolean not null default false,  -- guards one-time bootstrap grant
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_wallets_glow_nonneg check (glow >= 0)
);
alter table public.user_wallets enable row level security;
create trigger user_wallets_set_updated_at
  before update on public.user_wallets
  for each row execute procedure public.set_updated_at();

-- Inventory: items a user owns.
create table public.user_items (
  owner_id uuid references auth.users on delete cascade,
  item_id text references public.catalog_items(id) on delete cascade,  -- admin delete -> drops from inventories
  acquired_at timestamptz not null default timezone('utc', now()),
  source text not null default 'purchase',  -- 'purchase' | 'starter' | 'backfill'
  primary key (owner_id, item_id)
);
alter table public.user_items enable row level security;
-- No extra owner index: the (owner_id, item_id) PK already serves owner_id lookups.
```

**Atomic purchase RPC** (avoids read-modify-write races); returns a status + new balance +
acquisition time so the server maps it to HTTP without relying on exception parsing or a
follow-up select. Two plpgsql pitfalls this SQL deliberately avoids:
`returns table` column names become OUT parameters, so they must not collide with referenced
table columns (hence `out_*` names and qualified column references everywhere — a bare
`status = 'published'` or `set glow = glow - …` would raise "column reference is ambiguous"
at runtime, not at migration time).

```sql
create function public.purchase_item(p_owner uuid, p_item text)
returns table (out_status text, out_glow bigint, out_acquired_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_price bigint; v_glow bigint; v_acquired timestamptz;
begin
  -- item must exist and be published
  select coalesce(ci.price, 0) into v_price
  from public.catalog_items ci where ci.id = p_item and ci.status = 'published';
  if not found then
    return query select 'not_found'::text, null::bigint, null::timestamptz; return;
  end if;

  insert into public.user_wallets (owner_id) values (p_owner)
  on conflict (owner_id) do nothing;
  select w.glow into v_glow from public.user_wallets w
  where w.owner_id = p_owner for update;

  select ui.acquired_at into v_acquired from public.user_items ui
  where ui.owner_id = p_owner and ui.item_id = p_item;
  if found then
    return query select 'already_owned'::text, v_glow, v_acquired; return;
  end if;
  if v_glow < v_price then
    return query select 'insufficient_glow'::text, v_glow, null::timestamptz; return;
  end if;

  update public.user_wallets w set glow = w.glow - v_price where w.owner_id = p_owner
  returning w.glow into v_glow;
  insert into public.user_items (owner_id, item_id, source) values (p_owner, p_item, 'purchase')
  returning public.user_items.acquired_at into v_acquired;
  return query select 'ok'::text, v_glow, v_acquired;
end $$;

-- The function is security definer (bypasses RLS) and PostgREST exposes public functions
-- via /rpc/*, so lock execution to the server's service_role only — otherwise any
-- anon/authenticated client could purchase on behalf of an arbitrary p_owner.
revoke execute on function public.purchase_item(uuid, text) from public, anon, authenticated;
-- Explicit grant: do not rely on Supabase default privileges having granted service_role.
grant execute on function public.purchase_item(uuid, text) to service_role;
```

After approval: `corepack pnpm db:push` then `corepack pnpm db:types` and commit the
regenerated `packages/types/src/database.generated.ts` (needed for the new tables/RPC types).
**No data migration** — existing users are bootstrapped lazily (see §2).

---

## 2. Server — new module `apps/server/src/modules/shop/`

Mirror the `catalog` service factory shape (`createCatalogService(supabase, logger)`), and the
`studio/routes.ts` handler style (`preHandler: app.authenticate`, `ApiSuccess<T>`, zod body).

**`shop-service.ts`** — `createShopService(supabase)`:
- `ensureBootstrap(ownerId)` — idempotent, cheap after first call:
  1. `insert into user_wallets(owner_id) on conflict do nothing`.
  2. Read wallet; if `starter_granted = false`:
     - starter ids = `catalog_items` where `status='published' and access='free'`.
     - placed ids = catalog ids referenced in this owner's `studio_rooms.map` (read the row,
       collect `map[*].id` where `source==='catalog'`). **Filter placed ids against existing
       `catalog_items.id`** before inserting — `user_items.item_id` has an FK to
       `catalog_items`, and a placed item may reference a catalog row the admin has since
       deleted; unfiltered inserts would violate the FK.
     - `insert into user_items (...) on conflict do nothing` (source `'starter'` / `'backfill'`).
     - set `starter_granted = true`.
- `getWallet(ownerId)` → `{ glow }` (calls ensureBootstrap first).
- `getInventory(ownerId)` → `{ items: InventoryItem[] }` ordered by `acquired_at desc`.
  **Also calls ensureBootstrap first** — a new user's first request may be the inventory fetch
  (e.g. opening the studio picker), not the wallet fetch; without bootstrap here the inventory
  reads empty until the wallet endpoint happens to run. Bootstrap is idempotent, so both
  endpoints calling it is safe.
- `purchase(ownerId, itemId)` → calls `supabase.rpc('purchase_item', …)` (typed after
  `db:types` regenerates `Functions`). The RPC is `returns table`, so supabase-js resolves
  `data` as a **row array** — read the result as `data?.[0]` and treat a missing row as an
  internal error. Maps `out_status`:
  `ok`/`already_owned` → `{ wallet: { glow: out_glow }, item: { itemId, acquiredAt: out_acquired_at } }`
  (the RPC returns `acquired_at` for both, so no follow-up select);
  `insufficient_glow` → 400; `not_found` → 404.

**`routes.ts`** — mount in `apps/server/src/app.ts` with
`app.register(shopRoutes, { prefix: "/api/shop" })`:
- `GET /wallet` → `ApiSuccess<Wallet>`
- `GET /inventory` → `ApiSuccess<Inventory>`
- `POST /purchase` (zod `{ itemId: string }`) → `ApiSuccess<PurchaseItemResult>`

The Shop screen reads item catalog data from the **existing** `GET /api/studio/catalog`; no new
catalog endpoint. Decorate the service on the app like `catalogService`, or instantiate per-module
as `studio/routes.ts` does — match whichever the codebase already prefers (admin instantiates in
its route module; follow that).

---

## 3. Types — `packages/types/src/index.ts`

Add DTOs (reuse `CatalogItemDTO`; `owned` is computed client-side, no new item DTO):

```ts
export interface Wallet { glow: number; }
export interface InventoryItem { itemId: string; acquiredAt: string; }
export interface Inventory { items: InventoryItem[]; }
export interface PurchaseItemBody { itemId: string; }
export interface PurchaseItemResult { wallet: Wallet; item: InventoryItem; }
```

---

## 4. studio-core — purchase/price rule (pure)

Keep domain logic out of routes (CLAUDE.md §4). Add a tiny pure helper in
`packages/studio-core` (new `src/shop.ts`, exported from `src/index.ts`), e.g.
`resolvePrice(item)` (→ `price ?? 0`) and `canAfford(glow, item)`. Unit-tested in
`src/__tests__/`. (The transactional check lives in the RPC; this keeps the shared
notion of price/affordability consistent and testable.)

---

## 5. Mobile — new feature `apps/mobile/src/features/shop/`

Follow the **Explore atomic-split** pattern. This one feature owns the whole economy and
exports both screens plus the ownership atom consumed by studio.

```
features/shop/
  index.ts        # export ShopScreen, InventoryScreen, ownedItemIdsAtom, walletAtom
  api.ts          # getWallet, getInventory, purchaseItem (Bearer token, apiUrl from lib/api/client)
  _atoms/
    queries.ts    # walletAtom + inventoryAtom via atomWithQuery (non-suspense), key ["shop-*", userId]
    mutations.ts  # purchaseMutationAtom (atomWithMutation); onSuccess invalidate wallet+inventory keys
    ui.ts         # ownedItemIdsAtom (Set<string> derived from inventoryAtom)
                  # selectedCategoryAtom; shopCategoriesAtom (distinct tags.type from catalogAtom)
                  # visibleShopItemsAtom (catalog filtered by selected category)
  ui/
    shop-screen.tsx       # header Glow balance; horizontal category FlatList; grid of item cards
                          #   card shows art + price; Buy button, or "Owned" when owned.has(id)
    inventory-screen.tsx  # header Glow balance; grid of ALL owned items (placed or not)
```

Conventions to reuse:
- `apiUrl` + Bearer pattern from `apps/mobile/src/lib/api/client.ts`; auth via `queryAuthAtom`
  (`apps/mobile/src/lib/auth/query-auth-atom.ts`); `queryErrorResetVersionAtom`; scope every
  query key with `auth.userId`.
- Reuse `catalogAtom` / `catalogItemByIdAtom` from `@/features/catalog` for item art/price/tags.
- Use `atomWithQuery` (non-suspense) for wallet/inventory so `ownedItemIdsAtom` can also feed the
  studio picker without Suspense; render explicit skeleton on `isPending`, `MobileQueryErrorBoundary`
  + retry on error, pull-to-refresh on `refetch` (per CLAUDE.md §7). Category filter = horizontal
  `FlatList`. Card art via existing `artSource` helper; price shows Glow (`price ?? 0`, "Free" when 0).
- Purchase: `atomWithMutation` calling `purchaseItem`; on success invalidate `["shop-wallet",uid]`
  and `["shop-inventory",uid]` through `queryClientAtom`; disable the Buy button while pending and
  when already owned. **Note: `atomWithMutation` has no precedent in the repo yet** — existing
  writes use the `useMutation` hook directly (`features/studio/state/studio-sync.tsx`). Shop is
  the first `atomWithMutation` usage (jest `transformIgnorePatterns` already covers
  `jotai-tanstack-query`); if it proves awkward, falling back to `useMutation` inside the screen
  component is acceptable.

**Navigation:**
- New tab: `apps/mobile/src/app/(tabs)/inventory.tsx` → `export { InventoryScreen as default }`
  from `@/features/shop`; add a `<Tabs.Screen name="inventory" …>` (icon e.g. `bag`/`bag-outline`)
  in `apps/mobile/src/app/(tabs)/_layout.tsx`.
- New route: `apps/mobile/src/app/shop.tsx` → re-export `ShopScreen`; declare
  `<Stack.Screen name="shop" />` inside the `session !== null` `Stack.Protected` block in
  `apps/mobile/src/app/_layout.tsx`. Inventory screen has a "Shop" button →
  `router.push("/shop")`.

**Studio ownership gate** — `apps/mobile/src/features/studio/ui/item-picker.tsx`:
- In `CatalogGrid`, filter additionally by ownership:
  `items.filter(item => item.art?.url && fits(item, spot) && owned.has(item.id))`, where
  `owned = useAtomValue(ownedItemIdsAtom)` from `@/features/shop`.
- **Pending state must be distinguishable from "owns nothing".** `ownedItemIdsAtom` derives from
  the non-suspense `inventoryAtom`, so while the inventory query is still loading the set is
  empty — naively filtering would flash the "Buy more" empty state. Expose the pending flag
  (e.g. `ownedItemIdsAtom` returns `{ ids: Set<string>, isPending: boolean }`, or a sibling
  `inventoryPendingAtom`) and have `CatalogGrid` render its loading skeleton while pending.
  (`catalogAtom` is a plain `atomWithQuery` but always has `data` thanks to its MMKV/fallback
  `initialData`, so only the inventory side needs this handling.)
- Update the empty state: when the inventory has **loaded** and there are no owned compatible
  items, show a hint + button that closes the picker and `router.push("/shop")`
  ("Buy more in the Shop").

---

## 6. Admin panel — verify, minor polish only

Requirement "set name, asset/image, category, price" is **already covered**:
`display_name` (name), art upload (`catalog-art-upload.tsx`), `price`, and category via
`tags.type` (`catalog-tags-input.tsx`). Optional polish in
`apps/admin/src/resources/catalog/catalog-form.tsx`: relabel `price` → "Glow price" and make the
Type field read as "Category". No schema/API change required.

---

## 7. Tests

- **studio-core** (`src/__tests__/`, Vitest): `resolvePrice` / `canAfford`.
- **server** (`apps/server/tests/*.test.ts`, Vitest): shop routes — auth required; wallet/inventory
  bootstrap seeds starter + placed items once (`starter_granted` guard); purchase success deducts
  Glow + adds item; already-owned is idempotent; insufficient Glow → 400; unknown item → 404.
- **mobile** (`__tests__/`, RNTL/jest-expo): ShopScreen renders categories + Buy/Owned states;
  InventoryScreen lists owned items; item-picker hides unowned items, shows a loading state (not
  the Shop hint) while the inventory query is pending, and shows the Shop hint when the inventory
  has loaded and a spot has no owned compatible items.

---

## 8. Verification (end-to-end)

1. `corepack pnpm typecheck` and `corepack pnpm test` (turbo, whole workspace).
2. After approved `db:push` + `db:types`: start server (`corepack pnpm server:dev`).
3. Admin: create/publish a catalog item with art, a `tags.type` category, and a Glow price;
   confirm it appears in `GET /api/studio/catalog`.
4. Mobile (user runs the simulator per their preference; I'll state expected results): open the
   **Inventory** tab → starter items present; tap **Shop** → items grouped by category filter; buy
   an item → Glow decreases, item moves into Inventory; open **My Studio** → the item now appears in
   the spot picker; an unowned item does not, and an empty-compatible spot shows the Shop hint.

---

## Out of scope (future)

- Server-side ownership enforcement on `PUT /api/studio/room` (client-gated for now).
- Earning/topping-up Glow, premium pricing tiers, real-money purchase.
