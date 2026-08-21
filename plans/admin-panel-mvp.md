# Admin Panel — MVP Plan (Dashboard + Users Management)

## 0. Decision summary

The admin panel follows BNewApp's existing backend architecture: Fastify 5, a Supabase
secret-key client, JWKS-verified Supabase JWTs, and a pnpm/Turborepo monorepo. Confirmed decisions:

- **Admin UI**: new `apps/admin` — Vite + React 19 + **react-admin 5** + MUI +
  `ra-data-simple-rest`. Declarative `<Resource>` gives list/show/edit + pagination/filter/sort
  with minimal boilerplate.
- **Role storage**: Supabase `auth.users.app_metadata.role === "admin"`. No new DB column /
  migration. The server guard reads the claim from the verified JWT.
- **Admin API**: a dedicated server module mounted at `/api/admin/*` that speaks the
  react-admin **simple-rest** protocol (`range`/`sort`/`filter` query strings +
  `Content-Range` response header, list handlers return a raw array). This lives **beside**,
  not inside, the mobile `ApiSuccess<T>` convention — the admin module is its own contract.

MVP scope: **Dashboard** + **Users management** only. Reports and crisis-management modules are
out of scope because BNewApp has no corresponding data model.

## 1. BNewApp-specific scope

- BNewApp currently has `profiles` and `studio_rooms`, so the MVP consists of user management and
  a studio-focused dashboard.
- The `profiles` table contains only `id`, `email`, `username`, and `created_at`. User detail joins
  authentication data with the user's `studio_rooms` summary instead of relying on a separate
  user-statistics model.
- b-new-app uses **Biome** (not ESLint) and strict TS with `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`. All new code must pass `corepack pnpm lint` + `typecheck`.

## 2. Architecture overview

```
apps/
  admin/                         NEW — Vite + react-admin SPA
    src/
      main.tsx                   React root
      app.tsx                    <Admin> + <Resource name="users">
      lib/
        supabase-client.ts       publishable-key Supabase client
        auth-provider.ts         login/logout/checkAuth/checkError/getIdentity
        data-provider.ts         simpleRestProvider + Bearer httpClient + adminFetch()
      pages/
        dashboard.tsx            summary cards
      resources/users/
        user-list.tsx            Datagrid (searchable, sortable, paginated)
        user-show.tsx            detail: profile + auth + studio-room summary
        user-edit.tsx            edit allowlisted fields (username)
        index.ts
    index.html  vite.config.ts  tsconfig.json  package.json  .env.example
apps/
  server/src/
    plugins/auth.ts              EXTEND: AuthUser + requireAdmin + isAdmin
    lib/react-admin.ts           NEW: parseListQuery + contentRange
    modules/admin/
      routes.ts                  NEW: /users list/show/patch/put/delete + /dashboard/summary
      service.ts                 NEW: listUsers/getUser/updateUser/deleteUser/getDashboardSummary
      schemas.ts                 NEW: Zod params + UpdateUserRequest
    modules/dev/routes.ts        NEW (dev-only): create-user + grant-admin bootstrap
    app.ts                       EXTEND: CORS exposed headers/methods; register admin (+dev) routes
    config.ts                    EXTEND: DEV_ADMIN_SECRET (optional)
packages/types/src/index.ts      EXTEND: AdminUserRow, DashboardSummary DTOs
```

## 3. Phase 1 — Server: auth role + admin module

### 3.1 Extend the auth plugin (`apps/server/src/plugins/auth.ts`)

Supabase access tokens carry `app_metadata` and a top-level `role` (Postgres role,
`"authenticated"` for normal users — NOT our admin flag). The custom admin flag lives in
`app_metadata.role`. Extend `AuthUser` and add `requireAdmin`:

```ts
export interface AuthUser {
  sub: string;
  email?: string;
  role?: string;
  app_metadata?: { role?: string; [key: string]: unknown };
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    requireAdmin: (request: FastifyRequest) => Promise<void>;
  }
}
declare module "@fastify/jwt" {
  interface FastifyJWT { payload: AuthUser; user: AuthUser; }
}

function isAdmin(user: AuthUser): boolean {
  return user.app_metadata?.role === "admin";
}
// inside plugin, after `authenticate`:
app.decorate("requireAdmin", async (request) => {
  await app.authenticate(request);
  if (!isAdmin(request.user)) throw app.httpErrors.forbidden("Admin access required");
});
```

Keep the existing `@fastify/jwt` declaration merge in one place (avoid duplicate module blocks).

### 3.2 react-admin protocol helper (`apps/server/src/lib/react-admin.ts`)

Add a generic React Admin protocol helper: `ListQuery` Zod schema,
`parseListQuery(raw, fallbackSort)` → `{ start, end, sort, order, filter }`, and
`contentRange(resource, start, rowCount, total)`. Note: simple-rest `range` end is inclusive;
Supabase `.range(start, end)` is inclusive both ends → pass `Math.max(end - 1, start)`.

### 3.3 Admin schemas (`apps/server/src/modules/admin/schemas.ts`)

```ts
export const UserIdParam = z.object({ id: z.string().uuid() });
export const UpdateUserRequest = z.object({
  username: z.string().min(3).max(32).optional(),
});
```

### 3.4 Admin service (`apps/server/src/modules/admin/service.ts`)

`createAdminService(supabase)` returning:

- `listUsers({ start, end, sort, order, q })`:
  - `SORTABLE_COLUMNS = { id, username, email, created_at }` (fallback `created_at`).
  - Query `profiles` with `select("*", { count: "exact" })`, `.order(sortColumn, { ascending })`,
    `.range(start, Math.max(end - 1, start))`.
  - `q` → `.or(\`username.ilike.%q%,email.ilike.%q%\`)` — `profiles.email` is a `not null`
    column (populated by the `handle_new_user` trigger), so email search costs nothing extra;
    cover both fields in v1. Escape/strip `,` and `%` from `q` before interpolating into the
    `.or()` filter string.
  - Enrich each row with auth data (`email` is already on profiles; add `last_sign_in_at` +
    `app_metadata_role`) via paged `supabase.auth.admin.listUsers({ page, perPage: 1000 })` calls and
    a Map lookup, stopping once all IDs on the current profile page are found or auth users end.
  - Return `{ rows, total: count ?? rows.length }`.
- `getUser(id)`: `profiles` row + `supabase.auth.admin.getUserById(id)` (email, last_sign_in,
  app_metadata.role, email_confirmed_at) + the user's `studio_rooms` summary
  (`template_id, updated_at`, item count from `map`). Throw `notFound` if no profile.
- `updateUser(id, body)`: allowlist to `username` only; `.update(...).eq("id", id).select().single()`.
  Reject unknown keys defensively. `profiles.username` has a unique constraint
  (`profiles_username_unique`), so map a duplicate-key failure (Postgres error code `23505` on the
  returned Supabase `error.code`) to `httpErrors.conflict("Username is already taken")` instead of
  letting it fall through as a masked 500.
- `deleteUser(id)`: `supabase.auth.admin.deleteUser(id)` — cascades to `profiles` +
  `studio_rooms` via the `on delete cascade` FK to `auth.users`. Return `{ id }`.
- `getDashboardSummary()`:
  - Users: total (`count: "exact", head: true` on `profiles`) + new in last 24h/7d/30d
    (`.gte("created_at", iso)`).
  - Rooms: total `studio_rooms`, count updated in last 7d.
  - Return the `DashboardSummary` DTO.

Errors go through `app.httpErrors.*` (`@fastify/sensible`) — there is **no** `AppError` class in this
codebase. `apps/server/src/lib/errors.ts` only registers `errorHandlerPlugin`, whose handler reads
`code`/`statusCode`/`message` off the thrown error and hides 5xx messages. So throw
`app.httpErrors.notFound(...)` / `badRequest(...)` from the service (or return the error to the route
and throw there); do not invent an `AppError`.

### 3.5 Admin routes (`apps/server/src/modules/admin/routes.ts`)

```ts
export async function adminRoutes(fastify: FastifyInstance) {
  const service = createAdminService(fastify.supabase);
  fastify.addHook("preHandler", fastify.requireAdmin);   // guards every route

  fastify.get("/users", async (request, reply) => {
    const { start, end, sort, order, filter } = parseListQuery(request.query);
    const q = typeof filter.q === "string" ? filter.q : undefined;
    const { rows, total } = await service.listUsers({ start, end, sort, order, q });
    reply.header("Content-Range", contentRange("users", start, rows.length, total));
    return rows;                       // raw array — simple-rest contract, NOT ApiSuccess
  });

  fastify.get("/users/:id", async (req) => service.getUser(UserIdParam.parse(req.params).id));

  const update = async (req) => service.updateUser(
    UserIdParam.parse(req.params).id, UpdateUserRequest.parse(req.body));
  fastify.patch("/users/:id", update);
  fastify.put("/users/:id", update);   // react-admin's default update verb is PUT

  fastify.delete("/users/:id", async (req) =>
    service.deleteUser(UserIdParam.parse(req.params).id));

  fastify.get("/dashboard/summary", async () => service.getDashboardSummary());
}
```

### 3.6 Dev bootstrap module (`apps/server/src/modules/dev/routes.ts`) — dev only

Add `grant-admin` and optional `create-user` development routes guarded by an `x-admin-secret`
header matching `config.DEV_ADMIN_SECRET`. `grant-admin` writes
`app_metadata: { ...existing, role: "admin" | null }` via `auth.admin.updateUserById`.
Register **only** when `NODE_ENV === "development"` AND `DEV_ADMIN_SECRET` is set.

This is how the first admin account is created; document the two `curl` calls in `apps/admin/README.md`.
(Alternative for prod: flip the flag directly in Supabase dashboard / SQL — document both.)

### 3.7 Wire into `app.ts` + `config.ts`

- `config.ts`: add `DEV_ADMIN_SECRET: z.string().min(32).optional()`.
- `app.ts` CORS: add `exposedHeaders: ["Content-Range"]` and
  `methods: ["GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS"]` (react-admin reads
  `Content-Range` and uses PUT/PATCH/DELETE). In prod, `ALLOWED_ORIGINS` must include the
  admin origin.
- Register routes after `studioRoutes`:
  ```ts
  await app.register(adminRoutes, { prefix: "/api/admin" });
  if (config.NODE_ENV === "development" && config.DEV_ADMIN_SECRET) {
    await app.register(devRoutes, { prefix: "/dev" });
  }
  ```

## 4. Phase 2 — Admin web app scaffold (`apps/admin`)

Add a private ESM `package.json` named `@bnewapp/admin`, plus a workspace dependency on
`@bnewapp/types`:

```jsonc
{
  "name": "@bnewapp/admin", "private": true, "type": "module",
  "scripts": {
    "dev": "vite", "build": "tsc -b && vite build",
    "preview": "vite preview", "start": "serve -s dist -l ${PORT:-8080} --no-clipboard",
    "typecheck": "tsc -b"
  },
  "dependencies": {
    "@bnewapp/types": "workspace:*",
    "@supabase/supabase-js": "^2", "react": "19.2.0", "react-dom": "19.2.0",
    "react-admin": "^5.4", "ra-data-simple-rest": "^5.4", "react-router-dom": "^7", "serve": "^14"
  },
  "devDependencies": {
    "@types/react": "^19", "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4", "typescript": "~5.7", "vite": "^6"
  }
}
```

> **Version pins to respect.** Root `package.json` has `pnpm.overrides` forcing
> `react`/`react-dom` = `19.2.0`; list the same here (not `19.1.0`) so the manifest is not
> misleading — the override wins regardless. **react-admin + react-router:** react-admin `5.0-5.3`
> peer-depends on react-router **6**; react-router **7** is only supported from **react-admin 5.4+**.
> Pin `react-admin`/`ra-data-simple-rest` to `^5.4` when pairing with `react-router-dom@^7`, and after
> `corepack pnpm install` verify there is no unmet peer-dep warning for `react-router`. If pnpm still
> objects, either drop `react-router-dom` to `^6` or bump react-admin to the first 5.x that resolves
> cleanly — do not ship the `^5`/`^7` combo unverified.

- `pnpm-workspace.yaml` already globs `apps/*` — no change; run `corepack pnpm install`.
- `turbo.json` already defines `build`/`dev`/`typecheck` — the app is auto-discovered. Add root
  convenience scripts: `"admin": "pnpm --filter @bnewapp/admin dev"`,
  `"admin:build": "pnpm --filter @bnewapp/admin build"`.
- **tsconfig (not just `extends base`).** `tsconfig.base.json` sets `noEmit: true` and has **no**
  `composite`, so a bare `extends` + `tsc -b` will fail (`tsc -b` requires project references with
  `composite: true`). Use the standard Vite 3-file split:
  - `tsconfig.json` — a solution file with `"files": []` and
    `"references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]`.
  - `tsconfig.app.json` — extends base, `composite: true`, `noEmit: true` is fine here (type-check
    only; Vite does the bundling), `jsx: "react-jsx"` (inherited), `types: ["vite/client"]`,
    `include: ["src"]`.
  - `tsconfig.node.json` — extends base, `composite: true`, `include: ["vite.config.ts"]`.
  Then `build: "tsc -b && vite build"` type-checks via references, and `typecheck: "tsc -b"` (or
  `tsc --noEmit -p tsconfig.app.json`) works. **Do not use a bare `tsc --noEmit` for the
  `typecheck` script**: against the solution-style `tsconfig.json` (`files: []`, references only)
  it type-checks nothing and exits green. Confirm `corepack pnpm --filter @bnewapp/admin build`
  runs clean before wiring root scripts.
- `vite.config.ts`: `@vitejs/plugin-react`, dev server port (e.g. 5174 to avoid Metro 8081).
- **Biome:** root `corepack pnpm lint` is `biome lint .` across the repo. Ensure `dist/` and any
  Vite-generated output are ignored (repo `biome.json` `files.ignore`), and that the react-admin JSX
  passes the repo's Biome rules (`noExplicitAny` is an error).
- Env (`.env.example` + `.env.local`), all `VITE_`-prefixed (public, build-time inlined):
  `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

### 4.1 Supabase client + providers

- `lib/supabase-client.ts`: `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)`
  (browser session persistence + auto-refresh defaults).
- `lib/auth-provider.ts`: port verbatim — `login` (signInWithPassword), `logout`, `checkAuth`
  (getSession), `checkError` (401 → refreshSession then retry / sign out; **403 → surface
  "not an admin" but stay signed in**), `getIdentity`.
- `lib/data-provider.ts`: `simpleRestProvider(\`${VITE_API_URL}/api/admin\`, httpClient)` where
  `httpClient` injects `Authorization: Bearer <session.access_token>`. Export `adminFetch<T>(path)`
  for non-resource endpoints (dashboard summary) reusing the same `httpClient` so the token is
  never forgotten.

### 4.2 Root (`app.tsx`)

```tsx
<Admin title="BNewApp Admin" dataProvider={dataProvider} authProvider={authProvider}
       dashboard={Dashboard} requireAuth>
  <Resource name="users" list={UserList} show={UserShow} edit={UserEdit}
            icon={PersonIcon} recordRepresentation="username" />
</Admin>
```

## 5. Phase 3 — Dashboard (`pages/dashboard.tsx`)

MUI `Card` grid fed by `adminFetch<DashboardSummary>("/dashboard/summary")` in a `useEffect`
(cancel-on-unmount, graceful failure). Cards:

- **Users**: total; new in 24h / 7d / 30d.
- **Studio rooms**: total rooms; rooms updated in last 7d (activity signal).

Keep it small and extensible (metrics can grow later). Degrade to an error card if the fetch fails.

## 6. Phase 4 — Users management

- `user-list.tsx`: react-admin `<List>` + `<Datagrid rowClick="show" bulkActionButtons={false}>`:
  columns `username`, `email`, `app_metadata_role` (chip), `created_at` (date, sortable),
  `last_sign_in_at` (datetime). One `<SearchInput source="q" alwaysOn>` matching username OR
  email (server-side `.or()` — see §3.4). Default sort `created_at DESC`, 25/page.
- `user-show.tsx`: profile identity (username, email, id, role, created_at, email_confirmed_at,
  last_sign_in_at) + a "Studio room" panel (template, item count, updated_at) from `getUser`.
- `user-edit.tsx`: `<SimpleForm>` editing **username** only (`required`; on duplicate the server
  returns **409 conflict** with a friendly message — see §3.4 — surface it in the form).
  `mutationMode="pessimistic"`.
  Delete is provided by react-admin's default and backed by `DELETE /api/admin/users/:id`.

## 7. Shared types (`packages/types/src/index.ts`)

Add DTOs consumed by both server and admin (keeps the admin table columns and the server
service in lockstep):

```ts
export interface AdminUserRow {
  id: string; email: string; username: string;
  created_at: string; last_sign_in_at: string | null; app_metadata_role: string | null;
}
export interface DashboardSummary {
  users: { total: number; last24h: number; last7d: number; last30d: number };
  rooms: { total: number; updatedLast7d: number };
}
```

(Admin list rows are returned as a raw array to satisfy simple-rest — they are NOT wrapped in
`ApiSuccess<T>`. Only mobile-facing endpoints keep the `{ data }` envelope.)

`email` is non-nullable because it is sourced from `profiles.email`, which is a `not null` column —
not from the auth admin API. Only the auth-sourced fields (`last_sign_in_at`,
`app_metadata_role`) stay nullable, since the auth lookup is an enrichment that can miss.

## 8. Testing

> **Harness reality check.** The existing suite (`apps/server/tests/studio.test.ts`) does **not** mint
> or inject JWTs and does **not** exercise `preHandler`s. It captures the route handlers at
> registration time and calls them directly with a fake `request` (`{ user: { sub }, body, query,
> params }`) against a chainable `supabase.from(...)` mock (a thenable builder). Two consequences the
> plan must account for:
>
> 1. **Guard tests need a different path.** `requireAdmin` (401/403) cannot be covered by the
>    call-the-handler-directly style. Choose one and state it: **(a)** unit-test `isAdmin(user)` in
>    isolation plus a direct call to the `requireAdmin` decorator with a fake `request` (asserting it
>    throws `httpErrors.forbidden` / `unauthorized`), or **(b)** an `app.inject()` integration test
>    with `request.jwtVerify` stubbed (`vi.spyOn`) to inject admin / non-admin / invalid claims. Prefer
>    (a) for speed; add one (b) smoke test if you want the preHandler wiring covered end-to-end.
> 2. **`supabase.auth.admin.*` must be mocked.** The current builder mock only covers `.from()`
>    chains. The admin service also calls `supabase.auth.admin.listUsers` / `getUserById` /
>    `updateUserById` / `deleteUser` — extend the mock to expose an `auth.admin` object of `vi.fn()`s
>    returning `{ data, error }` shapes. Add this to a shared test helper, don't inline per test.

- **Server (Vitest, `apps/server/tests/`)** for the admin module — cover:
  - `requireAdmin`: 401 (no/invalid token), 403 (valid token, non-admin `app_metadata.role`),
    pass-through for admin — via the guard-test path chosen above.
  - `GET /users`: pagination (`range`), sort, `filter.q` search (matches username OR email via
    `.or()`), `Content-Range` header correctness (assert inclusive-end conversion
    `Math.max(end - 1, start)`).
  - `GET /users/:id`: found / not-found (profile missing → `notFound`).
  - `PATCH|PUT /users/:id`: allowlist enforced (unknown field ignored/rejected), success shape,
    duplicate username (`error.code === "23505"`) → 409 conflict.
  - `DELETE /users/:id`: calls `supabase.auth.admin.deleteUser` with the id.
  - `GET /dashboard/summary`: shape + window math (mock supabase counts and `auth.admin`).
- **Admin app**: no heavy test suite for MVP (react-admin is declarative); rely on `typecheck` +
  manual verification. Optionally a smoke test of `data-provider` header injection later.
- Run: `corepack pnpm --filter @bnewapp/server test`, `corepack pnpm typecheck`,
  `corepack pnpm lint`.

## 9. Bootstrap & run (developer flow)

```bash
corepack pnpm install
# 1. start server (needs DEV_ADMIN_SECRET in apps/server/.env for bootstrap)
corepack pnpm server:dev
# 2. create + promote the first admin
curl -X POST http://localhost:3000/dev/create-user -H "x-admin-secret: $DEV_ADMIN_SECRET" \
  -H 'content-type: application/json' -d '{"email":"you@example.com","password":"strong-pass"}'
curl -X POST http://localhost:3000/dev/grant-admin -H "x-admin-secret: $DEV_ADMIN_SECRET" \
  -H 'content-type: application/json' -d '{"email":"you@example.com"}'
# 3. run the admin panel
corepack pnpm admin          # vite on :5174, sign in with the admin account
```

## 10. Deploy notes

- `apps/admin` builds to static `dist/` (`tsc -b && vite build`), served by any static host
  (`serve`, Netlify, Vercel static, S3+CloudFront). `VITE_*` are build-time public values.
- Prod server: set `ALLOWED_ORIGINS` to include the admin panel origin; ensure CORS exposes
  `Content-Range`. Do **not** register the `/dev` routes in production (guarded already).
- Grant staging/prod admins via Supabase dashboard/SQL (`app_metadata.role = "admin"`), not a dev
  endpoint.

## 11. Task checklist (build order)

1. [x] Server: extend `plugins/auth.ts` (AuthUser + `requireAdmin` + `isAdmin`).
2. [x] Server: `lib/react-admin.ts` (parseListQuery + contentRange).
3. [x] Server: `modules/admin/{schemas,service,routes}.ts`.
4. [x] Server: `config.ts` DEV_ADMIN_SECRET + `modules/dev/routes.ts` (dev-only).
5. [x] Server: `app.ts` CORS exposed headers/methods + register admin/dev routes.
6. [x] Types: add `AdminUserRow` + `DashboardSummary`.
7. [x] Server tests: admin auth, users CRUD, dashboard summary.
8. [x] Scaffold `apps/admin` (package.json, vite/tsconfig, index.html, main.tsx, env).
9. [x] Admin: supabase-client + auth-provider + data-provider.
10. [x] Admin: `app.tsx` + users resource (list/show/edit) + dashboard.
11. [x] Root scripts (`admin`, `admin:build`); `pnpm install`.
12. [ ] Verify end-to-end: bootstrap admin, sign in, list/search/edit/delete users, dashboard.
13. [x] `corepack pnpm typecheck && lint && --filter @bnewapp/server test`.

## 12. Open questions / future (not MVP)

- Editable role from the panel (promote/revoke admin) — deferred; currently via dev endpoint / SQL.
- Richer dashboard metrics (retention, active users) once event data exists.
- Studio-room moderation / featured rooms in the Explore feed.
- Audit log for admin actions (add `updated_by`/timestamps if admin writes grow).
