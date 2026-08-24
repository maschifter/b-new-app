import { CATALOG, type CatalogItem } from "@bnewapp/studio-core";
import { describeContent, itemLabel } from "../placeholder";

function seedItem(id: string): CatalogItem {
  const item = CATALOG.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing seed catalog item: ${id}`);
  return item;
}

function uploadedItem(id: string): CatalogItem {
  const item = seedItem(id);
  return { ...item, art: { url: `https://example.com/${id}.webp` } };
}

describe("itemLabel", () => {
  it("title-cases a hyphenated id", () => {
    expect(itemLabel("big-screen")).toBe("Big Screen");
    expect(itemLabel("rug")).toBe("Rug");
  });
});

describe("describeContent", () => {
  it("does not render seed catalog items until remote art is uploaded", () => {
    for (const item of CATALOG) {
      expect(describeContent({ source: "catalog", id: item.id }, item)).toBeNull();
    }
  });

  it("returns null for a catalog ref that no longer exists", () => {
    expect(describeContent({ source: "catalog", id: "ghost" }, undefined)).toBeNull();
  });

  it("does not render video content without an uploaded thumbnail", () => {
    expect(describeContent({ source: "video", id: "clip-1" }, undefined)).toBeNull();
  });

  it("flags video and preview screens so the spot renders a play badge", () => {
    expect(
      describeContent({ source: "catalog", id: "big-screen" }, uploadedItem("big-screen"))
        ?.isVideo,
    ).toBe(true);
    expect(
      describeContent(
        { source: "catalog", id: "preview-screen" },
        uploadedItem("preview-screen"),
      )?.isVideo,
    ).toBe(true);
    expect(
      describeContent({ source: "catalog", id: "plant" }, uploadedItem("plant"))?.isVideo,
    ).toBe(false);
  });

  it("renders both mirror variants in the same wall-art frame", () => {
    expect(
      describeContent({ source: "catalog", id: "mirror" }, uploadedItem("mirror"))?.artFit,
    ).toBe("fill");
    expect(
      describeContent({ source: "catalog", id: "mirror-2" }, uploadedItem("mirror-2"))?.artFit,
    ).toBe("fill");
  });

  it("prefers admin-managed names, remote art, and remote hit-boxes", () => {
    const hitbox = {
      size: { width: 100, height: 200 },
      opaqueBounds: { x: 10, y: 20, width: 80, height: 160 },
    };
    const item: CatalogItem = {
      id: "remote-plant",
      tags: { type: "decor", size: "S" },
      name: "Admin Plant",
      art: { url: "https://example.com/plant.webp", hitbox },
    };

    expect(describeContent({ source: "catalog", id: item.id }, item)).toMatchObject({
      label: "Admin Plant",
      art: { uri: item.art?.url },
      artHitBox: hitbox,
    });
  });
});
