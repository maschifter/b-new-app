import { Edit, SimpleForm } from "react-admin";
import { CatalogArtUpload } from "./catalog-art-upload";
import { CatalogFormFields, catalogEditableFields } from "./catalog-form";
import type { CatalogRecord } from "./catalog-types";

export function CatalogEdit() {
  return (
    <Edit emptyWhileLoading mutationMode="pessimistic" transform={catalogEditableFields}>
      <SimpleForm resetOptions={{ keepDirtyValues: true }}>
        <CatalogFormFields />
        <CatalogArtUpload />
      </SimpleForm>
    </Edit>
  );
}
