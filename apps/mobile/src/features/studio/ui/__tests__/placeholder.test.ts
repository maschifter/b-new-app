import { CATALOG } from "../../data/catalog";
import { describeContent, itemColor, itemLabel } from "../placeholder";

describe("itemLabel", () => {
  it("title-cases a hyphenated id", () => {
    expect(itemLabel("big-screen")).toBe("Big Screen");
    expect(itemLabel("rug")).toBe("Rug");
  });
});

describe("describeContent", () => {
  it("resolves every seed catalog item to a presentation with bundled art", () => {
    for (const item of CATALOG) {
      const presentation = describeContent({ source: "catalog", id: item.id });
      expect(presentation).not.toBeNull();
      expect(presentation?.label).toBe(itemLabel(item.id));
      expect(presentation?.color).toBe(itemColor(item));
      // Every seed item ships a placeholder tile, so art must resolve.
      expect(presentation?.art).toBeTruthy();
    }
  });

  it("returns null for a catalog ref that no longer exists", () => {
    expect(describeContent({ source: "catalog", id: "ghost" })).toBeNull();
  });

  it("shows a neutral screen block with no art for video content", () => {
    const presentation = describeContent({ source: "video", id: "clip-1" });
    expect(presentation).toEqual({ label: "Video", color: "#7A3E8E", art: null });
  });
});
