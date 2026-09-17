// The record screen belongs to @bnewapp/dance-flow. The result screen is Stepz's own:
// it composes the flow's upload and score atoms with this app's local collection, the
// score confirmation and the personal-recording decision. Routes import from here,
// never from the package directly.
//
// `./reconciliation` is this feature's other public entry, kept separate so the root
// layout can mount the startup hook without loading the camera stack re-exported here.
export { RecordDanceScreen, type RecordedDanceClip } from "@bnewapp/dance-flow/record-screen";
export { ScanResultScreen } from "./ui/scan-result-screen";
