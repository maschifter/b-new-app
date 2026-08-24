import { Stack, Typography } from "@mui/material";
import { NumberInput, SelectInput, TextInput, required, useRecordContext } from "react-admin";
import { CatalogTagsInput } from "./catalog-tags-input";
import type { CatalogRecord } from "./catalog-types";

export const catalogCreateDefaults = {
  tags: { type: "decor", size: "S" },
  status: "draft",
  access: "free",
  price: null,
  sort_order: 0,
};

export function catalogEditableFields(record: Partial<CatalogRecord>) {
  return {
    tags: record.tags,
    display_name: record.display_name,
    status: record.status,
    access: record.access,
    price: record.price,
    sort_order: record.sort_order,
  };
}

export function CatalogFormFields({ includeId = false }: { includeId?: boolean }) {
  const record = useRecordContext<CatalogRecord>();

  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      {includeId ? (
        <TextInput
          source="id"
          label="ID (kebab-case slug)"
          validate={required()}
          helperText="Example: neon-floor-lamp. The ID cannot be changed later."
          fullWidth
        />
      ) : null}
      <TextInput source="display_name" label="Display name" validate={required()} fullWidth />
      <CatalogTagsInput key={record?.id ?? "catalog-create"} />
      <Typography variant="body2" color="text.secondary">
        Valid type tags: video, preview, tall, low, lounge, ceiling, floor, wall, decor. An item
        appears in a picker only when its tags satisfy that spot&apos;s accept rule.
      </Typography>
      <SelectInput
        source="status"
        choices={[
          { id: "draft", name: "Draft" },
          { id: "published", name: "Published" },
        ]}
        validate={required()}
        fullWidth
      />
      <SelectInput
        source="access"
        choices={[
          { id: "free", name: "Free" },
          { id: "premium", name: "Premium (ownership enforcement comes later)" },
        ]}
        validate={required()}
        fullWidth
      />
      <NumberInput source="price" min={0} helperText="Reserved for the later economy phase." />
      <NumberInput source="sort_order" label="Sort order" validate={required()} />
    </Stack>
  );
}
