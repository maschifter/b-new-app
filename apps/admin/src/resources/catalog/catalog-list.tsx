import {
  Datagrid,
  FunctionField,
  List,
  NumberField,
  SearchInput,
  SelectInput,
  TextField,
} from "react-admin";
import { STATUS_CHOICES } from "../choices";
import { CatalogArtCell } from "./catalog-art-upload";
import { CATALOG_ITEM_TYPES, type CatalogRecord } from "./catalog-types";

const filters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <SelectInput
    key="type"
    source="type"
    label="Type"
    choices={CATALOG_ITEM_TYPES.map((type) => ({ id: type, name: type }))}
  />,
  <SelectInput key="status" source="status" choices={STATUS_CHOICES} />,
  <SelectInput
    key="access"
    source="access"
    choices={[
      { id: "free", name: "Free" },
      { id: "premium", name: "Premium" },
    ]}
  />,
];

function itemType(record?: CatalogRecord): string {
  const value = record?.tags.type;
  return Array.isArray(value) ? (value.join(", ") ?? "") : (value ?? "");
}

export function CatalogList() {
  return (
    <List filters={filters} sort={{ field: "sort_order", order: "ASC" }} perPage={25}>
      <Datagrid rowClick="edit">
        <FunctionField label="Art" render={() => <CatalogArtCell />} />
        <TextField source="display_name" label="Name" />
        <TextField source="id" />
        <FunctionField<CatalogRecord> label="Type" render={itemType} />
        <TextField source="status" />
        <TextField source="access" />
        <NumberField source="price" label="Glow price" emptyText="—" />
        <NumberField source="sort_order" />
      </Datagrid>
    </List>
  );
}
