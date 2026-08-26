import {
  Datagrid,
  DateField,
  List,
  NumberField,
  SearchInput,
  SelectInput,
  TextField,
} from "react-admin";

const filters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <SelectInput
    key="status"
    source="status"
    choices={[
      { id: "draft", name: "Draft" },
      { id: "published", name: "Published" },
    ]}
  />,
];

export function DanceGenreList() {
  return (
    <List filters={filters} sort={{ field: "sort_order", order: "ASC" }} perPage={25}>
      <Datagrid rowClick="edit">
        <TextField source="name" />
        <TextField source="status" />
        <NumberField source="sort_order" />
        <DateField source="updated_at" showTime />
      </Datagrid>
    </List>
  );
}
