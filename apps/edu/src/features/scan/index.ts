// The record and result screens belong to @bnewapp/dance-flow. This feature is the
// app's seam onto them, and will own what Stepz adds around the flow: the saved
// device-only recording, and the deletion of the temporary cloud upload once the
// score is terminal. Routes import from here, never from the package directly.
export { DanceResultScreen } from "@bnewapp/dance-flow/result-screen";
export { RecordDanceScreen, type RecordedDanceClip } from "@bnewapp/dance-flow/record-screen";
