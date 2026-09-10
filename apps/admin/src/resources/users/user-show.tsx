import type { AdminUserDetail } from "@bnewapp/types";
import { Box, Card, CardContent, CardHeader, Chip, Stack, Typography } from "@mui/material";
import { DateField, Show, SimpleShowLayout, TextField, useRecordContext } from "react-admin";

function RoleField() {
  const record = useRecordContext<AdminUserDetail>();
  return record?.app_metadata_role ? (
    <Chip label={record.app_metadata_role} size="small" color="secondary" variant="outlined" />
  ) : (
    <Typography color="text.secondary">—</Typography>
  );
}

function StudioRoomPanel() {
  const record = useRecordContext<AdminUserDetail>();
  const room = record?.studio_room;
  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardHeader title="Studio room" />
      <CardContent>
        {room ? (
          <Stack spacing={1}>
            <Typography>Template: {room.template_id}</Typography>
            <Typography>Items: {room.item_count}</Typography>
            <Typography>Updated: {new Date(room.updated_at).toLocaleString()}</Typography>
          </Stack>
        ) : (
          <Typography color="text.secondary">No saved studio room.</Typography>
        )}
      </CardContent>
    </Card>
  );
}

export function UserShow() {
  return (
    <Show>
      <Box sx={{ maxWidth: 900 }}>
        <SimpleShowLayout>
          <TextField source="username" />
          <TextField source="email" />
          <TextField source="id" label="User ID" />
          <RoleField />
          <DateField source="created_at" label="Created" showTime />
          <DateField source="email_confirmed_at" label="Email confirmed" showTime />
          <DateField source="last_sign_in_at" label="Last sign-in" showTime />
          <StudioRoomPanel />
        </SimpleShowLayout>
      </Box>
    </Show>
  );
}
