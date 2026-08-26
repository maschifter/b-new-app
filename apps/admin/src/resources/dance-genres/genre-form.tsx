import type { AdminDanceGenre } from "@bnewapp/types";
import { Stack } from "@mui/material";
import { NumberInput, SelectInput, TextInput, required } from "react-admin";

export const danceGenreCreateDefaults = { status: "draft", sort_order: 0 };

export function danceGenreEditableFields(record: Partial<AdminDanceGenre>) {
  return {
    name: record.name,
    status: record.status,
    sort_order: record.sort_order,
  };
}

export function GenreFormFields() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      <TextInput source="name" validate={required()} fullWidth />
      <SelectInput
        source="status"
        choices={[
          { id: "draft", name: "Draft" },
          { id: "published", name: "Published" },
        ]}
        validate={required()}
        fullWidth
      />
      <NumberInput source="sort_order" validate={required()} />
    </Stack>
  );
}
