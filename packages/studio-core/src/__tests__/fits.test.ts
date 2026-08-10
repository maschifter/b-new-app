import { fits } from "../fits";
import type { CatalogItem, Spot } from "../types";

function item(id: string, tags: CatalogItem["tags"]): CatalogItem {
  return { id, tags };
}

function spot(accept: Spot["accept"]): Spot {
  return { id: "s", frame: { x: 0, y: 0, w: 0.1, h: 0.1 }, layer: 0, accept };
}

describe("fits — tags rule", () => {
  it("accepts an item that matches a single required tag", () => {
    expect(
      fits(item("rug", { type: "floor" }), spot({ kind: "tags", require: { type: "floor" } })),
    ).toBe(true);
  });

  it("rejects an item whose tag value differs", () => {
    expect(
      fits(item("poster", { type: "wall" }), spot({ kind: "tags", require: { type: "floor" } })),
    ).toBe(false);
  });

  it("requires every key to match (combined type + size)", () => {
    const rule = spot({ kind: "tags", require: { type: "floor", size: "L" } });
    expect(fits(item("stage", { type: "floor", size: "L" }), rule)).toBe(true);
    expect(fits(item("mat", { type: "floor", size: "S" }), rule)).toBe(false);
  });

  it("rejects when a required key is missing on the item", () => {
    expect(
      fits(
        item("mystery", { type: "floor" }),
        spot({ kind: "tags", require: { type: "floor", size: "L" } }),
      ),
    ).toBe(false);
  });

  it("matches when a multi-valued item tag intersects the requirement", () => {
    const rule = spot({ kind: "tags", require: { type: "decor" } });
    expect(fits(item("combo", { type: ["decor", "wall"] }), rule)).toBe(true);
  });

  it("matches when a multi-valued requirement is satisfied by the item", () => {
    const rule = spot({ kind: "tags", require: { size: ["M", "L"] } });
    expect(fits(item("big", { size: "L" }), rule)).toBe(true);
    expect(fits(item("small", { size: "S" }), rule)).toBe(false);
  });

  it("accepts anything against an empty requirement", () => {
    expect(fits(item("whatever", { type: "floor" }), spot({ kind: "tags", require: {} }))).toBe(
      true,
    );
  });
});

describe("fits — allow rule", () => {
  it("accepts only ids in the allow-list", () => {
    const rule = spot({ kind: "allow", ids: ["sofa", "pouf", "bench"] });
    expect(fits(item("pouf", {}), rule)).toBe(true);
    expect(fits(item("plant", {}), rule)).toBe(false);
  });
});
