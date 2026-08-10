# Studio — Backend + Database Plan

> Plan chi tiết để đưa feature Studio từ 100% local (jotai + mmkv) lên có backend + database.
> UI hiện tại (`apps/mobile/src/features/studio/ui/*`) **không phải sửa**. Code/SQL/identifier viết bằng English; phần diễn giải bằng tiếng Việt.

## Quyết định đã chốt

| Chủ đề | Lựa chọn | Ghi chú |
|---|---|---|
| Phạm vi | **Chỉ sync phòng cá nhân** (mỗi user 1 phòng), nhưng schema forward-compatible | Mở rộng visit / multi-room sau này rẻ (xem bên dưới) |
| Catalog + templates | **Giữ ở app** (`@bnewapp/studio-core`) làm source of truth | Server import studio-core để validate; đổi catalog = release app |
| Đường dữ liệu | **Qua Fastify server** (`/api/studio/room`, Bearer JWT) | Nhất quán với `/api/user/me`; validation tập trung ở server |
| Xung đột đa thiết bị | Last-write-wins theo `updated_at` | Đủ cho 1 user nhiều thiết bị |

## Hiện trạng (điểm xuất phát)

- Studio 100% local: `jotai + react-native-mmkv`, key `studio:v1:{ownerId}`, lưu `DecorationSnapshot { version, templateId, map }`.
- Domain thuần RN-free ở `@bnewapp/studio-core`: `fits()`, `migrate()`, `reconcile()`, `coerceSnapshot()`, `CATALOG` (46 items), `ROOM_TEMPLATE` (13 spots), `SAMPLE_DECORATION`, `CURRENT_VERSION`.
- Backend đã có: Fastify + Supabase (secret key, bypass RLS), JWT auth (`app.authenticate`, `request.user.sub`), 1 route mẫu `apps/server/src/modules/user/routes.ts`.
- DB: mới có bảng `profiles` + RLS. Scripts: `pnpm db:new|db:push|db:types`. Project linked: `bnewapp(staging)`.

## Kiến trúc tổng thể

```
Mobile (offline-first, mmkv giữ nguyên)
  │  useStudio() — UI KHÔNG đổi
  │  + lớp sync (react-query) chạy nền
  ▼
Fastify /api/studio/room  (Bearer JWT, scope theo request.user.sub)
  │  import @bnewapp/studio-core → coerce → migrate → reconcile (fits)
  ▼
Supabase: bảng studio_rooms (RLS owner-only)
```

Nguyên tắc: **mmkv = local cache tức thời (UX không giật); server = source of truth khi login / đổi thiết bị.** Sync là lớp phụ, không đụng UI.

---

## Phase 1 — Database migration

`pnpm db:new create_studio_rooms`:

```sql
create table public.studio_rooms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users on delete cascade,
  version     integer not null,
  template_id text not null,
  map         jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now()),
  unique (owner_id)                     -- 1 phòng/user; bỏ dòng này = mở multi-room
);

alter table public.studio_rooms enable row level security;

create policy "Owner can read own room"   on public.studio_rooms for select to authenticated using  ((select auth.uid()) = owner_id);
create policy "Owner can insert own room" on public.studio_rooms for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Owner can update own room" on public.studio_rooms for update to authenticated using  ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create trigger studio_rooms_set_updated_at
  before update on public.studio_rooms
  for each row execute procedure ...;   -- moddatetime hoặc hàm tự viết
```

Sau đó: **review migration → `pnpm db:push` → `pnpm db:types` → commit** `packages/types/src/database.generated.ts`.

Ghi chú: lưu `map` như 1 `jsonb` (khớp `DecorationSnapshot.map`), không normalize từng spot — validation `fits()` chạy ở server nên không cần ràng buộc quan hệ ở DB.

## Phase 2 — Cho server import được `@bnewapp/studio-core` + types dùng chung

1. **Export condition** (RỦI RO CAO — verify trước tiên): `packages/studio-core/package.json` hiện có điều kiện `react-native` + `types`. Thêm `import`/`node`/`default` trỏ `src/index.ts` (server chạy `tsx`, consume TS source được). Nếu không import được → cả Phase 3 phải đổi cách.
2. **`@bnewapp/types`**: thêm DTO `StudioRoom` (id, templateId, map, updatedAt) + `SaveStudioRoomBody`, dùng chung server & mobile.

## Phase 3 — Server module `apps/server/src/modules/studio/`

Bám pattern `modules/user/routes.ts` (preHandler `app.authenticate`, scope `request.user.sub`, trả `ApiSuccess<T>`).

- **`GET /api/studio/room`** → query theo `owner_id = sub`, `.maybeSingle()`.
  - Có row → `reconcile(migrate(coerceSnapshot(row)), ROOM_TEMPLATE, CATALOG)` rồi trả.
  - Không có → trả `null` (client seed từ `SAMPLE_DECORATION`).
- **`PUT /api/studio/room`** (upsert full snapshot — khớp model "ghi đè full snapshot" của `assign`/`clear`):
  1. `coerceSnapshot(body)`.
  2. `templateById(templateId)` không tồn tại → 400.
  3. `migrate` → `reconcile` (loại spot/item không `fits`).
  4. `upsert` theo `owner_id` (onConflict `owner_id`), trả bản đã reconcile.
- Đăng ký module trong `app.ts`.
- **Test** (vitest): auth bắt buộc, payload rác bị làm sạch, item không `fits` bị loại, upsert idempotent.

Không làm PATCH per-spot đợt này: client thay cả snapshot mỗi thao tác → PUT-whole đủ.

## Phase 4 — Mobile: lớp sync (không đụng UI)

1. **API client** (`apps/mobile/src/lib/api/client.ts`): `getStudioRoom(token)`, `saveStudioRoom(token, snapshot)` — cùng kiểu `fetch + Bearer` như `getCurrentUser`.
2. **Lớp sync** (`features/studio/state/studio-sync.ts`, dùng `@tanstack/react-query`):
   - **Hydrate on login**: `hydrated && session` → fetch room. Có → set vào `snapshotAtom(ownerId)`. Không có → push local lên (seed cloud).
   - **Push on change**: subscribe `snapshotAtom(ownerId)` → mutation `saveStudioRoom` có **debounce** (~800ms) + retry. mmkv đã ghi tức thời nên không chờ mạng.
   - **Offline**: ghi mmkv luôn; mutation fail → react-query retry, hoặc đánh dấu `dirty` push lại lần sau.
   - **Xung đột**: last-write-wins theo `updated_at`. Khi hydrate, nếu local `dirty` (chưa push) → **push trước rồi mới pull** để không mất thay đổi offline.
3. Gắn lớp sync ở `StudioProvider` (bọc quanh, không sửa `useStudio`/UI). `ownerId = session.user.id`, fallback `"local"` khi chưa đăng nhập.

## Phase 5 — QA trên simulator

- Assign/clear → kill app → mở lại: state khôi phục.
- Xóa mmkv (giả lập thiết bị mới) → login lại: phòng kéo về từ server.
- Airplane mode: vẫn sửa được (mmkv) → bật mạng: tự push.
- Server test xanh + typecheck toàn repo.

---

## Thứ tự thực thi & rủi ro

1. **Phase 2 trước tiên** — verify export condition studio-core (nếu vỡ, Phase 3 đổi cách).
2. Phase 1 (migration) song song được.
3. Phase 3 → 4 → 5 tuần tự.

**Rủi ro lớn nhất**: (a) export condition studio-core cho Node; (b) hydrate lúc login có thể ghi đè thay đổi offline chưa push → xử lý bằng push-trước-pull khi local `dirty`.

## Vì sao Phương án 1 dễ mở rộng

- `id uuid` là PK riêng (không phải `owner_id`) → multi-room = **bỏ** `unique(owner_id)`, không đổi PK.
- `map` public-shaped → visit = thêm RLS `select` public + route `GET /api/studio/room/:id`.
- Thêm `visibility` sau này = `alter table add column`, trivial.
