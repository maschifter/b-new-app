// A second, deliberately tiny entry point beside `index.ts`. The developer menu
// is imported by the root layout, and `index.ts` re-exports the dance screens —
// importing the toggle from there would pull the camera and network stack into
// the root module graph. Keep this file free of screen and api imports.
export { simulatedDanceRecordingEnabledAtom, useBackDanceCameraAtom } from "./_atoms/ui";
