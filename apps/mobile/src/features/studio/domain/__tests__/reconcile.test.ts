import { reconcile } from "../reconcile";
import type { CatalogItem, DecorationSnapshot, RoomTemplate } from "../types";

const template: RoomTemplate = {
  id: "room-1",
  themeId: "theme-1",
  spots: [
    {
      id: "floor-main",
      frame: { x: 0, y: 0.7, w: 1, h: 0.3 },
      layer: 10,
      accept: { kind: "tags", require: { type: "floor" } },
    },
    {
      id: "wall-art",
      frame: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
      layer: 20,
      accept: { kind: "tags", require: { type: "wall" } },
    },
  ],
};

const catalog: CatalogItem[] = [
  { id: "rug", tags: { type: "floor" } },
  { id: "poster", tags: { type: "wall" } },
];

function snapshot(map: DecorationSnapshot["map"]): DecorationSnapshot {
  return { version: 1, templateId: "room-1", map };
}

describe("reconcile", () => {
  it("keeps valid catalog entries", () => {
    const result = reconcile(
      snapshot({
        "floor-main": { source: "catalog", id: "rug" },
        "wall-art": { source: "catalog", id: "poster" },
      }),
      template,
      catalog,
    );
    expect(result.map).toEqual({
      "floor-main": { source: "catalog", id: "rug" },
      "wall-art": { source: "catalog", id: "poster" },
    });
  });

  it("drops entries pointing at a removed spot", () => {
    const result = reconcile(
      snapshot({ "ghost-spot": { source: "catalog", id: "rug" } }),
      template,
      catalog,
    );
    expect(result.map).toEqual({});
  });

  it("drops entries pointing at a removed item", () => {
    const result = reconcile(
      snapshot({ "floor-main": { source: "catalog", id: "deleted-item" } }),
      template,
      catalog,
    );
    expect(result.map).toEqual({});
  });

  it("drops entries whose item no longer fits the spot", () => {
    // poster (type=wall) placed in floor-main (accepts type=floor)
    const result = reconcile(
      snapshot({ "floor-main": { source: "catalog", id: "poster" } }),
      template,
      catalog,
    );
    expect(result.map).toEqual({});
  });

  it("keeps valid entries while dropping invalid ones in the same map", () => {
    const result = reconcile(
      snapshot({
        "floor-main": { source: "catalog", id: "rug" }, // valid
        "wall-art": { source: "catalog", id: "rug" }, // rug is type=floor -> invalid on wall
      }),
      template,
      catalog,
    );
    expect(result.map).toEqual({ "floor-main": { source: "catalog", id: "rug" } });
  });

  it("preserves version and templateId", () => {
    const result = reconcile(snapshot({}), template, catalog);
    expect(result.version).toBe(1);
    expect(result.templateId).toBe("room-1");
  });
});
