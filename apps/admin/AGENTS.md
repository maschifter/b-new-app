# Admin Guidelines

These rules apply to `apps/admin`. Also follow the root `AGENTS.md`.

## Structure

- This is a Vite, React, and react-admin application. Register resources in `src/app.tsx`.
- Keep resource lists, forms, create/edit/show views, and their exports in
  `src/resources/<resource>/`. Reuse existing form components between create and edit views.
- Put shared controls in `src/components/`, standalone pages in `src/pages/`, and auth/API
  infrastructure in `src/lib/`. Follow the existing MUI and react-admin component patterns.
- Consume shared contracts through `@bnewapp/types`; do not import server implementation
  files or React Native packages.

## Authentication and API

- Use the singleton Supabase client for auth, `authProvider` for session handling, and
  `dataProvider` for resource operations. Route custom API calls through the existing
  authenticated `httpClient` in `src/lib/data-provider.ts`.
- The server API is under `/api/admin` and uses simple-rest raw records/arrays and list
  `Content-Range` headers. Do not wrap these responses in the mobile `{ data: T }` envelope.
- Preserve the HTTP client's single refresh-and-retry behavior on 401. A 403 represents
  denied access and must not trigger repeated token refreshes or automatic sign-out.
- Enforce administrator permissions on the server. UI visibility and browser session
  checks are not authorization.
- Treat all `VITE_*` configuration as public. Never put service-role keys or server admin
  secrets in browser code. Keep optional login defaults restricted to development mode.

## Forms and Media

- Keep field names and payloads aligned with shared contracts and server validation.
  Preserve actionable validation and upload error feedback.
- Reuse the existing media upload controls and guards. Prevent submission while uploads
  are pending and preserve existing media when an unrelated edit is saved.
- Keep privileged writes behind the server API rather than writing database rows directly
  from resource components.

## Validation

Run from the repository root after the root package-manager version check. Copy
`.env.example` to `apps/admin/.env.local` first: `src/lib/supabase-client.ts` throws at import
time, so without `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` every suite that
reaches the data provider fails before it runs.

```sh
corepack pnpm --filter @bnewapp/admin typecheck
corepack pnpm --filter @bnewapp/admin test
corepack pnpm --filter @bnewapp/admin build
```

Use Vitest with the existing colocated `*.test.ts(x)` files. There is no DOM rendering
harness and `@testing-library/react` is not a dependency: the suites call a component and
assert on the element tree it returns, or cover a pure helper directly. Verify
affected forms, lists, authentication, and media flows in a browser when their visible
behavior changes. Report any verification that could not run.
