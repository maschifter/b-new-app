import type { AdminDanceGenre } from "@bnewapp/types";
import { Stack } from "@mui/material";
import { NumberInput, SelectInput, TextInput, required } from "react-admin";
import { STATUS_CHOICES } from "../choices";

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
      <SelectInput source="status" choices={STATUS_CHOICES} validate={required()} fullWidth />
      <NumberInput source="sort_order" validate={required()} />
    </Stack>
  );
}
