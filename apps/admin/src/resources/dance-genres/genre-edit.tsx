import { Edit, SimpleForm } from "react-admin";
import { GenreFormFields, danceGenreEditableFields } from "./genre-form";

export function DanceGenreEdit() {
  return (
    <Edit emptyWhileLoading mutationMode="pessimistic" transform={danceGenreEditableFields}>
      <SimpleForm>
        <GenreFormFields />
      </SimpleForm>
    </Edit>
  );
}
