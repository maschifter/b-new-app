import { CATALOG } from "../catalog.ts";
import { hydrateSnapshot, templateOrDefault } from "../hydrate.ts";
import { CURRENT_VERSION } from "../migrate.ts";
import { DEFAULT_TEMPLATE_ID, ROOM_TEMPLATE } from "../template.ts";

describe("templateOrDefault", () => {
  it("resolves a known template", () => {
    expect(templateOrDefault(DEFAULT_TEMPLATE_ID)).toBe(ROOM_TEMPLATE);
  });

  it("falls back to the default so a read never fails on a retired template", () => {
    expect(templateOrDefault("retired-template")).toBe(ROOM_TEMPLATE);
  });
});

describe("hydrateSnapshot", () => {
  it("keeps a placement the template and catalog both accept", () => {
    const snapshot = hydrateSnapshot(
      {
        version: CURRENT_VERSION,
        templateId: DEFAULT_TEMPLATE_ID,
        map: { "floor-main": { source: "catalog", id: "rug" } },
      },
      CATALOG,
    );

    expect(snapshot.map["floor-main"]).toEqual({ source: "catalog", id: "rug" });
  });

  it("drops a placement whose item is not in the given catalog", () => {
    const snapshot = hydrateSnapshot(
      {
        version: CURRENT_VERSION,
        templateId: DEFAULT_TEMPLATE_ID,
        map: { "floor-main": { source: "catalog", id: "not-in-catalog" } },
      },
      CATALOG,
    );

    expect(snapshot.map["floor-main"]).toBeUndefined();
  });

  it("returns an empty room for unusable input rather than throwing", () => {
    const snapshot = hydrateSnapshot(null, CATALOG);

    expect(snapshot).toEqual({
      version: CURRENT_VERSION,
      templateId: DEFAULT_TEMPLATE_ID,
      map: {},
    });
  });

  it("renders a retired template against the default instead of failing", () => {
    const snapshot = hydrateSnapshot(
      { version: CURRENT_VERSION, templateId: "retired-template", map: {} },
      CATALOG,
    );

    expect(snapshot.templateId).toBe("retired-template");
    expect(snapshot.map).toEqual({});
  });
});
