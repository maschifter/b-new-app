import { catalogItemIdsIn, coerceSnapshot } from "../coerce";
import { emptyDecoration } from "../template";
import type { DecorationSnapshot } from "../types";

// coerceSnapshot inherits the corrupt-data resilience the old AsyncStorage
// repository's parseSnapshot used to own: anything that isn't a well-formed
// snapshot reads as an empty room rather than crashing the reconcile step.
describe("coerceSnapshot", () => {
  it("passes a well-formed snapshot through unchanged", () => {
    const snap: DecorationSnapshot = {
      version: 1,
      templateId: "studio-room-1",
      map: { "floor-main": { source: "catalog", id: "rug" } },
    };
    expect(coerceSnapshot(snap)).toEqual(snap);
  });

  it("reads a non-object value as an empty room", () => {
    expect(coerceSnapshot("nope")).toEqual(emptyDecoration());
    expect(coerceSnapshot(null)).toEqual(emptyDecoration());
    expect(coerceSnapshot(undefined)).toEqual(emptyDecoration());
  });

  it("rejects a structurally invalid object", () => {
    expect(coerceSnapshot({ hello: "world" })).toEqual(emptyDecoration());
  });

  it("rejects an invalid snapshot version before migration can throw", () => {
    expect(coerceSnapshot({ version: -1, templateId: "studio-room-1", map: {} })).toEqual(
      emptyDecoration(),
    );
  });

  it("rejects malformed map entries before reconciliation", () => {
    expect(
      coerceSnapshot({ version: 1, templateId: "studio-room-1", map: { "decor-1": null } }),
    ).toEqual(emptyDecoration());
  });
});

describe("catalogItemIdsIn", () => {
  it("returns the deduped catalog ids and ignores video refs", () => {
    expect(
      catalogItemIdsIn({
        "floor-main": { source: "catalog", id: "rug" },
        "wall-art": { source: "catalog", id: "poster" },
        "wall-art-2": { source: "catalog", id: "rug" },
        "hero-screen": { source: "video", id: "clip-1" },
      }),
    ).toEqual(["rug", "poster"]);
  });

  it("skips a malformed entry instead of discarding the whole map", () => {
    expect(
      catalogItemIdsIn({
        "floor-main": { source: "catalog", id: "rug" },
        "wall-art": { source: "catalog" },
        "tall-module": { source: "banana", id: "x" },
        "hero-screen": { source: "catalog", id: 7 },
        "preview-1": null,
      }),
    ).toEqual(["rug"]);
  });

  it("returns nothing for a map that is not an object", () => {
    expect(catalogItemIdsIn(null)).toEqual([]);
    expect(catalogItemIdsIn([{ source: "catalog", id: "rug" }])).toEqual([]);
    expect(catalogItemIdsIn(undefined)).toEqual([]);
  });
});
