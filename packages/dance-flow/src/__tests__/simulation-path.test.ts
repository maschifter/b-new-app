import { isSimulatedDanceClipPath } from "../simulation-path";

it("matches a clip inside the simulation cache directory", () => {
  expect(isSimulatedDanceClipPath("file:///cache/dance-recording-simulation/a1b2c3d4.mp4")).toBe(
    true,
  );
});

it("does not match a real capture", () => {
  expect(isSimulatedDanceClipPath("file:///cache/VisionCamera/attempt.mov")).toBe(false);
});

// A directory merely *named* with the constant as a prefix or suffix is a different
// directory, so the match is on a whole path segment.
it("does not match a directory that only shares the prefix", () => {
  expect(isSimulatedDanceClipPath("file:///cache/dance-recording-simulation-old/clip.mp4")).toBe(
    false,
  );
});
