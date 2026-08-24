import { describe, expect, it } from "vitest";
import { CatalogEdit } from "./catalog-edit";

describe("CatalogEdit", () => {
  it("waits for the record before mounting fields with record-derived local state", () => {
    const edit = CatalogEdit();

    expect(edit.props.emptyWhileLoading).toBe(true);
  });

  it("keeps unsaved form fields when an art upload refreshes the record", () => {
    const edit = CatalogEdit();
    const form = edit.props.children;

    expect(form.props.resetOptions).toEqual({ keepDirtyValues: true });
  });
});
