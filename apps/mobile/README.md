# @bnewapp/mobile

Expo (React Native) client for the dance app. It handles Supabase email/password
authentication and talks to the [`@bnewapp/server`](../server/README.md) API.

## Stack

- [Expo 55](https://expo.dev/) with [Expo Router](https://docs.expo.dev/router/introduction/)
  (file-based routing, typed routes)
- React Native 0.83 / React 19.2
- [Supabase JS](https://supabase.com/docs/reference/javascript) for auth (PKCE flow,
  session persisted in `AsyncStorage`)
- [TanStack Query](https://tanstack.com/query) for server state
- `react-native-reanimated`, `react-native-gesture-handler`, `react-native-screens`,
  `react-native-safe-area-context`

## Getting started

Install dependencies once from the repository root:

```bash
pnpm install
```

Configure the app:

```bash
cp apps/mobile/.env.example apps/mobile/.env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Start Metro, then build and launch a native app (Expo Router uses native modules, so
Expo Go is not sufficient — use a dev build):

```bash
pnpm mobile            # start Metro (from the repo root)
pnpm mobile:ios        # build & run on iOS
pnpm mobile:android    # build & run on Android
```

Make sure the server is running (`pnpm server:dev`) so the app can reach the API.

## Environment variables

Every `EXPO_PUBLIC_*` value is embedded in the JS bundle — never put secrets here.

| Variable                             | Required | Notes                                                     |
| ------------------------------------ | -------- | --------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`           | **yes**  | Supabase project URL                                      |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`| **yes** | Supabase publishable (anon) key                           |
| `EXPO_PUBLIC_API_URL`                | no       | Override the API base URL (see below)                     |

### How the API URL is resolved

`src/lib/api/client.ts` picks the API base URL so that the common cases need no
configuration:

- **Local development, unset `EXPO_PUBLIC_API_URL`:** the host is derived from Metro's
  `hostUri`, so a physical device automatically follows the dev machine's current LAN
  IP. On the Android emulator `localhost`/`127.0.0.1` is rewritten to `10.0.2.2`.
- **`EXPO_PUBLIC_API_URL` set:** used as-is (with the same Android rewrite in dev). Set
  it for a shared, tunnelled, or production backend.
- The server port is assumed to be `3000`.

Staging and production builds require `EXPO_PUBLIC_API_URL` to be an HTTPS URL. The
Expo config rejects a build with a missing, malformed, or HTTP API URL rather than
shipping a client that falls back to `localhost`.

## Authentication flow

1. The user signs up / signs in with email + password directly against Supabase
   (`src/lib/auth/supabase.ts`).
2. Supabase creates the `auth.users` row; a database trigger creates the matching
   `public.profiles` row (see the migration in `supabase/migrations/`).
3. `AuthSessionProvider` (`src/lib/auth/session-provider.tsx`) hydrates and tracks the
   session. Expo Router's `Stack.Protected` guards gate the `auth` vs authenticated-tab stacks on
   whether a session exists.
4. Authenticated API calls send the Supabase access token as a bearer token to
   `GET /api/user/me`.

If the Supabase env vars are missing, `supabase` is `null` — the app renders but auth
is disabled.

## Project structure

```
src/
├── app/                      # Expo Router routes (file-based)
│   ├── _layout.tsx           # providers + protected-stack navigator
│   ├── index.tsx             # redirect to /studio or /auth/sign-in
│   ├── auth/                 # sign-in stack
│   └── (tabs)/               # authenticated Crew, Studio, and Explore tabs
├── components/               # shared UI (screen, text-field, bouncable-press)
├── features/                 # feature screens (auth/sign-in-screen)
└── lib/
    ├── api/client.ts         # typed fetch helpers + API URL resolution
    ├── auth/                 # supabase client + session provider
    └── providers/            # react-query provider
```

Path alias `@/*` maps to `src/*` (see `tsconfig.json`).

## Native builds & environments

`app.config.ts` derives the bundle identifier and display name from
`EAS_BUILD_PROFILE`:

| Profile         | Display name       | Bundle id suffix   |
| --------------- | ------------------ | ------------------ |
| `development`   | `BNewApp (Dev)`     | `.dev`             |
| `staging`       | `BNewApp (Staging)` | `.staging`         |
| `production` /  default | `BNewApp`   | none               |

Regenerate the native projects with the matching profile:

```bash
pnpm mobile:prebuild             # staging profile, --clean
pnpm mobile:prebuild:staging
pnpm mobile:prebuild:production
```

Metro is configured for the monorepo (`metro.config.js`): it watches the workspace
`packages/` folder and pins `react`, `react-dom`, and `react-native` to the root
`node_modules` to avoid duplicate copies.

## Scripts

```bash
pnpm start              # expo start
pnpm start:fresh        # expo start --clear
pnpm ios                # expo run:ios
pnpm ios:simulator      # expo run:ios --device
pnpm android            # expo run:android
pnpm android:device     # expo run:android --device
pnpm typecheck          # tsc --noEmit
```

The equivalent `pnpm mobile:*` scripts at the repo root proxy to these.
