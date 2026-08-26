import { Create, SimpleForm } from "react-admin";
import {
  MoveFormFields,
  danceMoveCreateDefaults,
  danceMoveEditableFields,
  validateDanceMove,
} from "./move-form";

export function DanceMoveCreate() {
  return (
    <Create redirect="edit" transform={danceMoveEditableFields}>
      <SimpleForm defaultValues={danceMoveCreateDefaults} validate={validateDanceMove}>
        <MoveFormFields />
      </SimpleForm>
    </Create>
  );
}
