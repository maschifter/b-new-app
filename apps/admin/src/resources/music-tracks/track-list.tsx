import type { AdminMusicTrack } from "@bnewapp/types";
import {
  Datagrid,
  FunctionField,
  List,
  NumberField,
  SearchInput,
  SelectInput,
  TextField,
} from "react-admin";
import { MediaPreview } from "../../components/media-url-input";
import { STATUS_CHOICES } from "../choices";

const filters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <SelectInput key="status" source="status" choices={STATUS_CHOICES} />,
];

export function MusicTrackList() {
  return (
    <List filters={filters} sort={{ field: "sort_order", order: "ASC" }} perPage={25}>
      <Datagrid rowClick="edit">
        <FunctionField<AdminMusicTrack>
          label="Thumbnail"
          render={(record) => <MediaPreview url={record.thumbnail_url} kind="image" compact />}
        />
        <TextField source="title" />
        <TextField source="artist" emptyText="—" />
        <TextField source="status" />
        <NumberField source="sort_order" />
      </Datagrid>
    </List>
  );
}
