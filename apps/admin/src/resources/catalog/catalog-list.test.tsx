import { describe, expect, it } from "vitest";
import { CatalogArtCell } from "./catalog-art-upload";
import { CatalogList } from "./catalog-list";
import { CATALOG_ITEM_TYPES } from "./catalog-types";

describe("CatalogList", () => {
  it("offers a filter for every supported catalog item type", () => {
    const list = CatalogList();
    const typeFilter = list.props.filters.find(
      (filter: { props: { source: string } }) => filter.props.source === "type",
    );

    expect(typeFilter.props.choices).toEqual(
      CATALOG_ITEM_TYPES.map((type) => ({ id: type, name: type })),
    );
  });

  it("makes the art cell interactive without adding a separate upload column", () => {
    const list = CatalogList();
    const datagrid = list.props.children;
    const artField = datagrid.props.children.find(
      (field: { props: { label?: string } }) => field.props.label === "Art",
    );
    const uploadField = datagrid.props.children.find(
      (field: { props: { label?: string } }) => field.props.label === "Art upload",
    );

    expect(datagrid.props.rowClick).toBe("edit");
    expect(artField.props.render().type).toBe(CatalogArtCell);
    expect(uploadField).toBeUndefined();
  });

  it("shows the Glow price in the catalog grid", () => {
    const list = CatalogList();
    const datagrid = list.props.children;
    const priceField = datagrid.props.children.find(
      (field: { props: { source?: string } }) => field.props.source === "price",
    );

    expect(priceField.props.label).toBe("Glow price");
  });
});
