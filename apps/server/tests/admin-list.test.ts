import { describe, expect, it } from "vitest";

import { rangeEnd, searchTerm, sortColumn } from "../src/lib/admin-list.js";

const SORTABLE = new Set(["id", "title", "sort_order"]);

describe("sortColumn", () => {
  it("keeps a column the resource exposes", () => {
    expect(sortColumn("title", SORTABLE, "sort_order")).toBe("title");
  });

  it.each(["created_at", "", "title; drop table"])("falls back for %o", (sort) => {
    expect(sortColumn(sort, SORTABLE, "sort_order")).toBe("sort_order");
  });
});

describe("searchTerm", () => {
  it("returns undefined when no query was sent", () => {
    expect(searchTerm(undefined)).toBeUndefined();
  });

  it.each(["", "   ", ",", "%%"])("returns undefined for %o", (q) => {
    expect(searchTerm(q)).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(searchTerm("  neon  ")).toBe("neon");
  });

  it("strips the characters PostgREST reads as filter syntax", () => {
    expect(searchTerm("neon,status.eq.published")).toBe("neonstatus.eq.published");
    expect(searchTerm("50%")).toBe("50");
  });
});

describe("rangeEnd", () => {
  it("converts a half-open range to an inclusive one", () => {
    expect(rangeEnd(0, 25)).toBe(24);
    expect(rangeEnd(25, 50)).toBe(49);
  });

  it("never returns a bound below start, so an empty page stays valid", () => {
    expect(rangeEnd(10, 10)).toBe(10);
    expect(rangeEnd(10, 0)).toBe(10);
  });
});
