import { videoStep } from "../result-flow";

it("asks nothing when there is no temporary recording to offer", () => {
  expect(videoStep({ hasTemporaryClip: false, hasPersonalRecording: false })).toEqual({
    kind: "none",
  });
  expect(videoStep({ hasTemporaryClip: false, hasPersonalRecording: true })).toEqual({
    kind: "none",
  });
});

it("offers Save My Video for a move with no personal recording", () => {
  expect(videoStep({ hasTemporaryClip: true, hasPersonalRecording: false })).toEqual({
    kind: "save",
  });
});

it("offers the replacement prompt when a personal recording already exists", () => {
  expect(videoStep({ hasTemporaryClip: true, hasPersonalRecording: true })).toEqual({
    kind: "replace",
  });
});
