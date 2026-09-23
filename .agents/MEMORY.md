# Project Memory

## Project Environment

- Environment last inspected on 2026-08-25.
- BNewApp is an Expo 55.0.28 / React Native 0.83.10 development-build app with Expo Router.
- Mobile supports iOS and Android; native projects are generated on demand and gitignored.
  Generate them through the repository prebuild/run scripts; never depend on manual native edits.
- Use `corepack pnpm@10.13.1` from the repository root.
- Metro uses port 8081 by default. Run `corepack pnpm mobile`, `mobile:ios`, or `mobile:android`;
  if another scoped project already owns 8081, start BNewApp on a different port and pass the same
  port to `expo run:ios` / `expo run:android` rather than stopping the unrelated server.
- Mobile validation commands are `corepack pnpm --filter @bnewapp/mobile typecheck`,
  `corepack pnpm --filter @bnewapp/mobile test`, and `corepack pnpm lint`.
- The API server defaults to port 3000. Server and domain tests use Vitest; mobile tests use Jest
  with React Native Testing Library. No dedicated end-to-end test framework is configured.
- Argent 0.19.0 is installed. Production, staging, and development bundle IDs are
  `com.bnewapp.mobile`, `com.bnewapp.mobile.staging`, and `com.bnewapp.mobile.dev`.
- This is a development-build app with native modules, so Expo Go is insufficient;
  `expo-dev-client` is installed as the development-build launcher/runtime.
- Treat `apps/mobile/src/app` as routing composition, feature code as
  `src/features/<feature>`, shared primitives as `src/components`, and infrastructure as `src/lib`.
- The admin panel is a Vite 6 / React 19 / React Admin 5 app in `apps/admin`, served at
  `http://localhost:5174` with its API expected at `http://localhost:3000`. Validate it with
  `corepack pnpm --filter @bnewapp/admin test`, `typecheck`, and `corepack pnpm admin:build`.
- Environment rechecked on 2026-09-23: `apps/edu` is also an Expo iOS/Android app (bundle id
  `com.bnewapp.stepz`); its checks are `corepack pnpm --filter @bnewapp/edu typecheck` and
  `corepack pnpm --filter @bnewapp/edu test`.
