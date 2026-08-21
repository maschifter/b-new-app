import { Chip } from "@mui/material";
import {
  Datagrid,
  DateField,
  List,
  type RaRecord,
  SearchInput,
  TextField,
  WrapperField,
  useRecordContext,
} from "react-admin";

const userFilters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Search username or email" />,
];

function RoleField() {
  const record = useRecordContext<RaRecord>();
  const role = record?.app_metadata_role;
  if (!role) return <span style={{ color: "#888" }}>—</span>;
  return <Chip label={String(role)} size="small" color="secondary" variant="outlined" />;
}

export function UserList() {
  return (
    <List filters={userFilters} sort={{ field: "created_at", order: "DESC" }} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="username" />
        <TextField source="email" />
        <WrapperField label="Role" source="app_metadata_role" sortable={false}>
          <RoleField />
        </WrapperField>
        <DateField source="created_at" label="Created" />
        <DateField source="last_sign_in_at" label="Last sign-in" showTime sortable={false} />
      </Datagrid>
    </List>
  );
}
