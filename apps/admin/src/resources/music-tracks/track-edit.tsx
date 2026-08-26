import { Edit, SimpleForm } from "react-admin";
import { TrackFormFields, musicTrackEditableFields } from "./track-form";

export function MusicTrackEdit() {
  return (
    <Edit emptyWhileLoading mutationMode="pessimistic" transform={musicTrackEditableFields}>
      <SimpleForm>
        <TrackFormFields />
      </SimpleForm>
    </Edit>
  );
}
