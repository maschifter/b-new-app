import type { AdminDanceMove } from "@bnewapp/types";
import {
  ChipField,
  Datagrid,
  FunctionField,
  List,
  NumberField,
  ReferenceArrayField,
  ReferenceField,
  ReferenceInput,
  SearchInput,
  SelectInput,
  SingleFieldList,
  TextField,
} from "react-admin";
import { MediaPreview } from "../../components/media-url-input";

const levelChoices = [1, 2, 3, 4].map((level) => ({ id: level, name: `Level ${level}` }));

const filters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <SelectInput
    key="status"
    source="status"
    choices={[
      { id: "draft", name: "Draft" },
      { id: "published", name: "Published" },
    ]}
  />,
  <SelectInput key="level" source="level" choices={levelChoices} />,
  <ReferenceInput key="genre_id" source="genre_id" reference="dance-genres">
    <SelectInput label="Genre" optionText="name" />
  </ReferenceInput>,
];

export function DanceMoveList() {
  return (
    <List filters={filters} sort={{ field: "sort_order", order: "ASC" }} perPage={25}>
      <Datagrid rowClick="edit">
        <FunctionField<AdminDanceMove>
          label="Thumbnail"
          render={(record) => <MediaPreview url={record.thumbnail_url} kind="image" compact />}
        />
        <TextField source="title" />
        <NumberField source="level" />
        <TextField source="status" />
        <ReferenceArrayField source="genre_ids" reference="dance-genres">
          <SingleFieldList linkType={false}>
            <ChipField source="name" />
          </SingleFieldList>
        </ReferenceArrayField>
        <ReferenceField source="music_id" reference="music-tracks" emptyText="—" link={false}>
          <TextField source="title" />
        </ReferenceField>
        <NumberField source="sort_order" />
      </Datagrid>
    </List>
  );
}
