import { Create, SimpleForm } from "react-admin";
import {
  CatalogFormFields,
  catalogCreateDefaults,
  catalogEditableFields,
} from "./catalog-form";
import type { CatalogRecord } from "./catalog-types";

function createPayload(record: CatalogRecord) {
  return { id: record.id, ...catalogEditableFields(record) };
}

export function CatalogCreate() {
  return (
    <Create redirect="edit" transform={createPayload}>
      <SimpleForm defaultValues={catalogCreateDefaults}>
        <CatalogFormFields includeId />
      </SimpleForm>
    </Create>
  );
}
