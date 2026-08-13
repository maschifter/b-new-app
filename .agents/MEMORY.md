# Project Memory

## Project Environment

- BNewApp is an Expo 55 / React Native 0.83 development-build app with Expo Router.
- Mobile supports iOS and Android; generated native projects are present and gitignored.
- Use `corepack pnpm@10.13.1` from the repository root.
- Metro uses port 8081. Run `corepack pnpm mobile`, `mobile:ios`, or `mobile:android`.
- Mobile validation commands are `corepack pnpm --filter @bnewapp/mobile typecheck`,
  `corepack pnpm --filter @bnewapp/mobile test`, and `corepack pnpm lint`.
- Argent 0.19.0 is installed. Production, staging, and development bundle IDs are
  `com.bnewapp.mobile`, `com.bnewapp.mobile.staging`, and `com.bnewapp.mobile.dev`.
- Treat `apps/mobile/src/app` as routing composition, feature code as
  `src/features/<feature>`, shared primitives as `src/components`, and infrastructure as `src/lib`.
