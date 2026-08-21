import {
  Edit,
  type RaRecord,
  SimpleForm,
  TextInput,
  maxLength,
  minLength,
  required,
} from "react-admin";

function editableFields(record: RaRecord) {
  return { username: record.username };
}

export function UserEdit() {
  return (
    <Edit mutationMode="pessimistic" transform={editableFields}>
      <SimpleForm>
        <TextInput
          source="username"
          validate={[required(), minLength(3), maxLength(32)]}
          parse={(value: string) => value.trim()}
        />
      </SimpleForm>
    </Edit>
  );
}
