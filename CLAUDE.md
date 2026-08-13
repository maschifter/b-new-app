# CLAUDE.md

@AGENTS.md

Guidance for AI agents working in this repository. These are this app's own
conventions — read them before writing code.

## 1. Project overview

A dance product built as a **pnpm + Turborepo** monorepo. The flagship feature is
the **Studio**: a spot-based room the user decorates with catalog items, persisted
locally and synced to the cloud.

Key technologies:

- **Mobile** (`apps/mobile`): Expo 54 + expo-router, React 19 / React Native 0.81,
  Jotai + react-native-mmkv for state, `@tanstack/react-query` for server data,
  Supabase Auth, expo-image for art.
- **Server** (`apps/server`): Fastify 5, `@fastify/jwt`, Zod for input validation,
  Supabase secret-key client for DB access.
- **Domain** (`packages/studio-core`): pure, RN-free TypeScript rules.
- **Contracts** (`packages/types`): shared DTOs + generated Supabase types.
- **Package manager**: pnpm `10.13.1` (pinned in `package.json#packageManager`),
  Node `>=20` (`.nvmrc` = 20).

## 2. Monorepo structure & layering rules

```
apps/
  mobile/    @bnewapp/mobile   Expo app (all UI, local state, sync)
  server/    @bnewapp/server   Fastify API (auth, persistence)
packages/
  studio-core/ @bnewapp/studio-core  Pure domain: snapshot/template/catalog + coerce→migrate→reconcile
  types/       @bnewapp/types         Shared DTOs (ApiSuccess, StudioRoom, …) + database.generated.ts
  utils/       @bnewapp/utils         Genuinely cross-package helpers only
```

Dependencies flow **inward** — enforce these boundaries:

- `apps/mobile` and `apps/server` may import `packages/*`; **mobile never imports
  server and server never imports mobile**.
- **Pure, platform-free domain logic belongs in `packages/studio-core`** (no React,
  RN, Expo, MMKV, or fetch imports there — it must stay runnable in Node and the
  browser). Both apps consume it.
- **Shared request/response shapes belong in `packages/types`** — never redefine a
  DTO inside an app when it crosses the wire.

## 3. Essential commands

Run from the repo root (Turborepo fans out to the right package):

```bash
corepack pnpm --version      # must match package.json#packageManager
corepack pnpm dev            # run everything in dev (turbo dev)
corepack pnpm typecheck      # turbo typecheck across the workspace
corepack pnpm test           # turbo test across the workspace
corepack pnpm lint           # biome lint
corepack pnpm format         # biome check --write

corepack pnpm server:dev     # Fastify only (@bnewapp/server)
corepack pnpm mobile         # Expo Metro (@bnewapp/mobile)
corepack pnpm mobile:ios     # build & run iOS
corepack pnpm mobile:android # build & run Android
```

### Database workflow

```bash
corepack pnpm db:new <name> # Create a timestamped migration in supabase/migrations/
corepack pnpm db:push       # Apply pending migrations to the linked Supabase project
corepack pnpm db:types      # Regenerate packages/types/src/database.generated.ts
```

Use migrations as the source of truth for schema changes. Obtain explicit approval before
running `db:push` or linked-project type generation. After each approved `db:push`, run
`db:types` and commit the generated types. Review each migration before pushing it.

## 4. API layer

Plain REST via Fastify modules — **no RPC framework, no DI container**. Keep modules
simple.

- **One module per domain**: `apps/server/src/modules/<domain>/routes.ts`, mounted in
  `apps/server/src/app.ts`.
- **Auth**: guard protected routes with the `app.authenticate` preHandler (defined in
  `apps/server/src/plugins/auth.ts`). It runs `request.jwtVerify()`; inside the handler
  the caller's id is `request.user.sub`.
- **DB access**: use `app.supabase` (a secret-key `SupabaseClient<Database>` decorated
  by `apps/server/src/plugins/supabase.ts`). It bypasses RLS, so every query must enforce
  the endpoint's access model explicitly. Owner-only endpoints scope by the authenticated
  user (`.eq("owner_id", request.user.sub)`); intentional cross-user reads must define and
  test their visibility rules rather than relying on RLS.
- **Input validation**: parse `request.body` / query with a **Zod** schema and throw
  `app.httpErrors.badRequest(...)` on failure. Do not trust client input.
- **Responses**: return the `ApiSuccess<T>` shape `{ data: T }` (defined in
  `@bnewapp/types`). Errors go through `app.httpErrors.*` (`@fastify/sensible`).

Shape to follow (from `apps/server/src/modules/studio/routes.ts`):

```ts
app.get(
  "/api/studio/room",
  { preHandler: app.authenticate },
  async (request): Promise<ApiSuccess<StudioRoom | null>> => {
    const { data: row, error } = await app.supabase
      .from("studio_rooms")
      .select(ROOM_COLUMNS)
      .eq("owner_id", request.user.sub)
      .maybeSingle();
    if (error) throw app.httpErrors.internalServerError("Could not load the studio room");
    if (!row) return { data: null };
    // Domain rules live in studio-core, never inline in the route:
    const migrated = migrate(
      coerceSnapshot({ version: row.version, templateId: row.template_id, map: row.map }),
    );
    const template = templateById(migrated.templateId) ?? ROOM_TEMPLATE;
    const snapshot = reconcile(migrated, template, CATALOG);
    return { data: { id: row.id, ownerId: row.owner_id, snapshot, updatedAt: row.updated_at } };
  },
);
```

## 5. Adding a new endpoint (end-to-end workflow)

1. **Migration** — `corepack pnpm db:new <name>`, write SQL, review it.
2. **Apply & regenerate after explicit approval** — `corepack pnpm db:push` then
   `corepack pnpm db:types`, commit `database.generated.ts`.
3. **DTO** — add/extend the request & response types in `packages/types/src/index.ts`.
   Reuse existing DTOs rather than duplicating (`SaveStudioRoomBody = DecorationSnapshot`).
4. **Server route** — add a handler in the domain's `routes.ts`: `app.authenticate`
   preHandler, Zod validation, domain logic delegated to `studio-core`, `ApiSuccess<T>`
   response.
5. **Mobile API fn** — add a typed fetch fn in the feature's `api.ts` (via
   `apps/mobile/src/lib/api/client.ts` conventions).
6. **Atom / query** — wire it into the feature's `_atoms/` (see §6).

## 6. Mobile state management — atomic split rules (go-forward standard)

New features use a **feature folder with a narrow public entry point**. Add only the
state files and folders the feature actually needs; the full atomic split is a menu, not
required ceremony for every feature:

```
apps/mobile/src/features/<feature>/
  index.ts         # narrow public exports consumed outside the feature
  _atoms/
    queries.ts    # server reads: jotai-tanstack-query atoms
    mutations.ts  # server writes: mutation atoms
    ui.ts         # client-only UI state + derived atoms
    effects.ts    # atomEffect / sync glue
  ui/             # screen + presentational components
  api.ts          # typed fetch fns for this feature
```

Rules:

- Other features and Expo Router entries import from the feature's `index.ts`; do not
  deep-import its `_atoms/`, `ui/`, or `api.ts` internals.
- **One concern per atom.** Components subscribe only to the atoms they need
  (`useAtomValue` / `useSetAtom`), not a giant hook.
- **Server state** = react-query atoms via `jotai-tanstack-query`
  (`atomWithQuery` / `atomWithInfiniteQuery`).
- Keep query results in the query atom cache; do not copy them into a second plain Jotai atom.
- Query atoms and React Query hooks must use the same `QueryClient`. Keep the root
  `QueryClientProvider` and hydrate that exact stable client into
  `jotai-tanstack-query`'s `queryClientAtom`; never let the two APIs create separate caches.
- Authenticated query atoms read `{ userId, accessToken }` from the query-auth atom owned by
  `apps/mobile/src/lib/auth/`. `AuthSessionProvider` keeps that single projection synchronized
  with the Supabase session; feature atoms must not call React auth hooks or create another auth
  source. Include `userId` in every user-scoped query key so cache identity does not depend on
  cleanup timing. When an authenticated session ends or changes user, disable those queries,
  cancel in-flight requests, and remove the previous user's query entries before enabling the
  next identity. A same-user token refresh updates the token without changing the key or cache.
- **Client state** = plain Jotai atoms (`atom`, `atomFamily`).
- **Local persistence** = `createAtomWithMMKV` (`apps/mobile/src/lib/jotai/atom-with-mmkv.ts`),
  keyed by `ownerId`, under a **versioned namespace** (`<feature>:v1:`), with an
  `MMKV` instance scoped per feature (`new MMKV({ id: "<feature>" })`).
- **Lists / feeds** = `atomWithInfiniteQuery` + **cursor pagination**, plus a derived
  atom that `flatMap`s the pages into a flat item list for the screen. Use the
  server cursor as the next `pageParam`; never derive pagination state from returned item counts.
  If server-side reconciliation can produce an empty page with a non-null cursor, advance from
  the newly received page until it yields items or reaches a null cursor; do not use the total
  flattened-list length as the continuation condition.

> **Legacy shape — do not copy for new features.** The **studio** feature predates
> this convention. It lives in `apps/mobile/src/features/studio/state/`
> (`atoms.ts`, `studio-provider.tsx`, `studio-sync.tsx`) using MMKV-backed
> `atomFamily`s keyed by `ownerId` plus an imperative sync effect. It does **not**
> use the `_atoms/` split or `jotai-tanstack-query`. Read it to learn the
> MMKV/keyed-atom and coerce→migrate→reconcile patterns, but structure new work per
> the atomic split above. **Explore is the first feature on the new standard.**

MMKV atom helper, keyed & versioned (the persistence pattern to reuse):

```ts
const mmkv = new MMKV({ id: "studio" });
const atomWithMMKV = createAtomWithMMKV(mmkv);
const KEY_PREFIX = "studio:v1:";
const snapshotAtom = atomFamily((ownerId: string) =>
  atomWithMMKV<DecorationSnapshot>(`${KEY_PREFIX}${ownerId}`, emptyDecoration()),
);
```

## 7. List screen composition

Compose feeds as **screen → list → item card**:

- `FlatList` (grid via `numColumns`), `keyExtractor` = a stable id (e.g. `ownerId`).
- Interactive cards expose a meaningful accessibility label and button/link role; icon-only
  controls provide a label and a reasonable touch target.
- **Pull-to-refresh** wired to the query's `refetch`.
- **Skeleton** while `isPending`; **`ListEmptyComponent`** for the empty state.
- **Infinite scroll**: `onEndReached` → `fetchNextPage`, guarded by
  `hasNextPage && !isFetchingNextPage`; footer spinner while `isFetchingNextPage`.
- Perf on long grids: `removeClippedSubviews`, a small `windowSize`.

## 8. Navigation

expo-router **file-based** routing under `apps/mobile/src/app/`. Tabs live in
`app/(tabs)/` (`_layout.tsx` defines them). Detail routes take params via path
segments — e.g. a room detail is `app/room/[ownerId].tsx`, opened with
`router.push("/room/" + ownerId)` and read via `useLocalSearchParams()`.
Authenticated routes outside the protected `(tabs)` group must also be declared inside the
`session !== null` `Stack.Protected` block in the root `app/_layout.tsx`; filesystem discovery
alone makes an undeclared route eligible but does not apply that auth guard.

The read-only room renderer is `StudioStage`
(`apps/mobile/src/features/studio/ui/studio-stage.tsx`): props are `template` + `map`
+ `mode` (`"edit" | "preview" | "visit"`). Derive `template` from a snapshot with
`templateById(snapshot.templateId) ?? ROOM_TEMPLATE` (from `@bnewapp/studio-core`) and
pass `snapshot.map`. In `preview`/`visit` mode selection is ignored, so any room can be
rendered read-only.

## 9. Code style

- **English only** for code, comments, commit messages, and PR descriptions.
- **No narrative comments.** Comment *why*, not *what*; let names carry meaning.
- **Biome** is the formatter + linter: 2-space indent, line width 100, organized
  imports. `noExplicitAny` is an **error** — no `any`.
- **TypeScript strict** (`tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`. Type inputs and outputs precisely.
- Match the surrounding file's naming and idiom; no broad refactors or new
  dependencies without discussion.

## Testing

- **Mobile** (`apps/mobile`): `jest-expo` (`jest.config.js`); tests live in
  `__tests__/` next to the code, with a `moduleNameMapper` aliasing
  `@bnewapp/studio-core` to its `src/`. Use React Native Testing Library for
  components.
- **Server** (`apps/server`): **Vitest** — tests in `apps/server/tests/*.test.ts`. For protected
  routes, cover authentication, invalid boundary input, success/not-found behavior, and
  Supabase failures according to risk.
- **studio-core** (`packages/studio-core`): **Vitest** — tests in `src/__tests__/`.

Keep `packages/studio-core` green when touching shared domain logic; both apps depend
on it.
