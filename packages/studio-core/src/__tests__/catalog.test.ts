import { CATALOG, defaultItemLabel, fallbackCatalog } from "../catalog.ts";

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

describe("fallbackCatalog", () => {
  it("publishes every seed item as free, named from its slug", () => {
    const catalog = fallbackCatalog();

    expect(catalog.version).toBe(0);
    expect(catalog.items).toHaveLength(CATALOG.length);
    expect(catalog.items.every((item) => item.status === "published")).toBe(true);
    expect(catalog.items.every((item) => item.access === "free")).toBe(true);
    expect(catalog.items.find((item) => item.id === "plant")?.name).toBe("Plant");
  });

  it("keeps each seed item's tags and returns a fresh object per call", () => {
    const first = fallbackCatalog();

    expect(first.items.find((item) => item.id === "plant")?.tags).toEqual({
      type: "decor",
      size: "S",
    });
    expect(fallbackCatalog().items).not.toBe(first.items);
  });
});
