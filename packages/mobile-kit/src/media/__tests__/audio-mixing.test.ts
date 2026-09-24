import {
  type AudioSessionPlayer,
  keepBackgroundAudio,
  takeOverBackgroundAudio,
} from "../audio-mixing";

/** Every real player starts on the iOS native default, which is the mode under test. */
function player(): AudioSessionPlayer {
  return { audioMixingMode: "doNotMix" };
}

describe("audio mixing modes", () => {
  it("lets a silent player leave the system audio alone", () => {
    const silent = player();
    keepBackgroundAudio(silent);
    expect(silent.audioMixingMode).toBe("mixWithOthers");
  });

  it("keeps a soundtrack player on an explicit mode rather than an inherited one", () => {
    const soundtrack: AudioSessionPlayer = { audioMixingMode: "auto" };
    takeOverBackgroundAudio(soundtrack);
    expect(soundtrack.audioMixingMode).toBe("doNotMix");
  });
});
