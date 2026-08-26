import { Create, SimpleForm } from "react-admin";
import { GenreFormFields, danceGenreCreateDefaults, danceGenreEditableFields } from "./genre-form";

export function DanceGenreCreate() {
  return (
    <Create redirect="edit" transform={danceGenreEditableFields}>
      <SimpleForm defaultValues={danceGenreCreateDefaults}>
        <GenreFormFields />
      </SimpleForm>
    </Create>
  );
}
