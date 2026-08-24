import { CATALOG, defaultItemLabel } from "../catalog.ts";

describe("defaultItemLabel", () => {
  it("turns catalog slugs into title-cased labels", () => {
    expect(defaultItemLabel("big-screen")).toBe("Big Screen");
    expect(defaultItemLabel("rug")).toBe("Rug");
  });
});

describe("CATALOG", () => {
  it("keeps the complete legacy seed available for offline fallback", () => {
    expect(CATALOG).toHaveLength(39);
  });
});
