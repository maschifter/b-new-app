import { describe, expect, it } from "vitest";
import { canAfford, resolvePrice } from "../shop.ts";

describe("shop pricing", () => {
  it("treats a missing price as free", () => {
    expect(resolvePrice({})).toBe(0);
    expect(canAfford(0, {})).toBe(true);
  });

  it("uses the item's explicit Glow price", () => {
    expect(resolvePrice({ price: 250 })).toBe(250);
    expect(canAfford(250, { price: 250 })).toBe(true);
    expect(canAfford(249, { price: 250 })).toBe(false);
  });
});
