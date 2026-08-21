# @bnewapp/admin

Internal BNewApp admin panel built with Vite, React 19, and react-admin. It authenticates with
Supabase and calls the Fastify simple-rest API under `/api/admin/*`.

## Local development

1. Copy `apps/admin/.env.example` to `apps/admin/.env.local` and set the three public `VITE_*`
   values.
2. Set `DEV_ADMIN_SECRET` in `apps/server/.env`, then start the API with
   `corepack pnpm server:dev`.
3. Bootstrap an admin account using the calls below.
4. Start the panel with `corepack pnpm admin`, then open <http://localhost:5174>.

For local development, `VITE_DEV_ADMIN_EMAIL` and `VITE_DEV_ADMIN_PASSWORD` in `.env.local` can
pre-fill the login form. These defaults are used only when Vite runs in development mode; a
production build always presents empty fields and requires credentials to be entered manually.

```sh
curl -X POST http://localhost:3000/dev/create-user \
  -H "content-type: application/json" \
  -H "x-admin-secret: $DEV_ADMIN_SECRET" \
  -d '{"email":"you@example.com","password":"strong-password"}'

curl -X POST http://localhost:3000/dev/grant-admin \
  -H "content-type: application/json" \
  -H "x-admin-secret: $DEV_ADMIN_SECRET" \
  -d '{"email":"you@example.com"}'
```

The browser may hold an access token minted before the role was granted. Sign out and back in so
Supabase issues a token containing `app_metadata.role = "admin"`.

## Production

Build with `corepack pnpm admin:build` and deploy `apps/admin/dist` as a static site. Add its origin
to the server's `ALLOWED_ORIGINS`. The `/dev` routes are registered only in development; grant an
administrator in staging or production by setting `auth.users.raw_app_meta_data.role` to `admin`
through the Supabase Dashboard or an audited privileged SQL operation.
