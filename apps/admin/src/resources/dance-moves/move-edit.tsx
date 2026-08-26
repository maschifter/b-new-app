import { Edit, SimpleForm } from "react-admin";
import { MoveFormFields, danceMoveEditableFields, validateDanceMove } from "./move-form";

export function DanceMoveEdit() {
  return (
    <Edit emptyWhileLoading mutationMode="pessimistic" transform={danceMoveEditableFields}>
      <SimpleForm validate={validateDanceMove}>
        <MoveFormFields />
      </SimpleForm>
    </Edit>
  );
}
