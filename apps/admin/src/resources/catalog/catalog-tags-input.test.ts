import { describe, expect, it } from "vitest";
import { EXTRA_TAGS_ERROR, validateExtraTagsDraft } from "./catalog-tags-input";

describe("CatalogTagsInput", () => {
  it("accepts a JSON object containing string and non-empty string-array tags", () => {
    expect(validateExtraTagsDraft('{"theme":"neon","moods":["bright"]}')).toBeUndefined();
    expect(validateExtraTagsDraft("")).toBeUndefined();
  });

  it("blocks malformed JSON and unsupported tag values", () => {
    expect(validateExtraTagsDraft("{")).toBe(EXTRA_TAGS_ERROR);
    expect(validateExtraTagsDraft('{"moods":[]}')).toBe(EXTRA_TAGS_ERROR);
    expect(validateExtraTagsDraft('{"theme":""}')).toBe(EXTRA_TAGS_ERROR);
    expect(validateExtraTagsDraft('{"moods":[""]}')).toBe(EXTRA_TAGS_ERROR);
    expect(validateExtraTagsDraft('{"priority":1}')).toBe(EXTRA_TAGS_ERROR);
  });
});
