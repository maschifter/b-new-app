import { Create, SimpleForm } from "react-admin";
import { TrackFormFields, musicTrackCreateDefaults, musicTrackEditableFields } from "./track-form";

export function MusicTrackCreate() {
  return (
    <Create redirect="edit" transform={musicTrackEditableFields}>
      <SimpleForm defaultValues={musicTrackCreateDefaults}>
        <TrackFormFields />
      </SimpleForm>
    </Create>
  );
}
