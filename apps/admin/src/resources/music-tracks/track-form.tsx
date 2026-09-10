import type { AdminMusicTrack } from "@bnewapp/types";
import { Stack } from "@mui/material";
import { NumberInput, SelectInput, TextInput, required } from "react-admin";
import { MediaUploadInput } from "../../components/media-upload-input";

export const musicTrackCreateDefaults = {
  artist: null,
  thumbnail_url: null,
  status: "draft",
  sort_order: 0,
};

export function musicTrackEditableFields(record: Partial<AdminMusicTrack>) {
  return {
    title: record.title,
    artist: record.artist ?? null,
    audio_url: record.audio_url,
    thumbnail_url: record.thumbnail_url ?? null,
    status: record.status,
    sort_order: record.sort_order,
  };
}

export function TrackFormFields() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      <TextInput source="title" validate={required()} fullWidth />
      <TextInput source="artist" validate={required()} fullWidth />
      <MediaUploadInput
        source="audio_url"
        label="Audio URL"
        preview="audio"
        kind="audio"
        target="track"
        requirement="required"
        validate={required()}
      />
      <MediaUploadInput
        source="thumbnail_url"
        label="Thumbnail URL"
        preview="image"
        kind="image"
        target="track"
        requirement="required"
        validate={required()}
      />
      <SelectInput
        source="status"
        choices={[
          { id: "draft", name: "Draft" },
          { id: "published", name: "Published" },
        ]}
        validate={required()}
        fullWidth
      />
      <NumberInput source="sort_order" validate={required()} />
    </Stack>
  );
}
