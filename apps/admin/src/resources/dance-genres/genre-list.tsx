import {
  Datagrid,
  DateField,
  List,
  NumberField,
  SearchInput,
  SelectInput,
  TextField,
} from "react-admin";
import { STATUS_CHOICES } from "../choices";

const filters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <SelectInput key="status" source="status" choices={STATUS_CHOICES} />,
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
