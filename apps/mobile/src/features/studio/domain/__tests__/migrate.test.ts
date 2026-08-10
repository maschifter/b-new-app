import { CURRENT_VERSION, migrate } from "../migrate";
import type { DecorationSnapshot } from "../types";

function snapshot(version: number): DecorationSnapshot {
  return { version, templateId: "room-1", map: {} };
}

describe("migrate", () => {
  it("upgrades a v0 snapshot to the current version", () => {
    const result = migrate(snapshot(0));
    expect(result.version).toBe(CURRENT_VERSION);
    expect(result.templateId).toBe("room-1");
    expect(result.map).toEqual({});
  });

  it("moves legacy decor items to their v2 modules", () => {
    const result = migrate({
      version: 1,
      templateId: "studio-room-1",
      map: {
        "decor-1": { source: "catalog", id: "trophy" },
        "decor-2": { source: "catalog", id: "boombox" },
        "decor-3": { source: "catalog", id: "plant" },
      },
    });

    expect(result).toEqual({
      version: 2,
      templateId: "studio-room-1",
      map: {
        "tall-module": { source: "catalog", id: "trophy" },
        "low-module": { source: "catalog", id: "boombox" },
        "decor-3": { source: "catalog", id: "plant" },
      },
    });
  });

  it("leaves a current-version snapshot untouched", () => {
    const input = snapshot(CURRENT_VERSION);
    expect(migrate(input)).toEqual(input);
  });

  it("leaves a newer-than-current snapshot as-is rather than crashing", () => {
    const input = snapshot(CURRENT_VERSION + 1);
    expect(migrate(input)).toEqual(input);
  });

  it("throws when a needed migrator is missing (chain integrity)", () => {
    // -1 is below CURRENT_VERSION but has no registered migrator.
    expect(() => migrate(snapshot(-1))).toThrow(/migrator/i);
  });
});
