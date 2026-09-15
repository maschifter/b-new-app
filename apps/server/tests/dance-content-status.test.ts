import { describe, expect, it } from "vitest";

import { parseDanceContentStatus } from "../src/modules/admin/dance-content-schemas.js";

describe("parseDanceContentStatus", () => {
  it.each(["draft", "published"])("accepts the %s status", (value) => {
    expect(parseDanceContentStatus(value)).toBe(value);
  });

  it.each(["", "Draft", "archived", "published "])("rejects %o", (value) => {
    expect(() => parseDanceContentStatus(value)).toThrow(
      `Unexpected dance content status: ${value}`,
    );
  });
});
