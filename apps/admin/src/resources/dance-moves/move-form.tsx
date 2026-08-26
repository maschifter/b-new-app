import type { AdminDanceMove } from "@bnewapp/types";
import { Divider, Stack, Typography } from "@mui/material";
import {
  AutocompleteArrayInput,
  AutocompleteInput,
  NumberInput,
  ReferenceArrayInput,
  ReferenceInput,
  SelectInput,
  TextInput,
  required,
} from "react-admin";
import { MediaUrlInput, parseNullableUrl } from "../../components/media-url-input";

export const PUBLISHED_MOVE_VIDEO_ERROR = "A published move requires a main video URL";

const nullableMediaFields = [
  "thumbnail_url",
  "main_video_url",
  "pro_dancer_video_url",
  "pro_dancer_image_url",
  "dancer_tip_video_url",
  "dancer_tip_image_url",
  "presentation_video_url",
  "film_yourself_video_url",
] as const;

export const danceMoveCreateDefaults = {
  description: null,
  level: 1,
  bpm: null,
  music_id: null,
  genre_ids: [],
  status: "draft",
  sort_order: 0,
  ...Object.fromEntries(nullableMediaFields.map((field) => [field, null])),
};

export function danceMoveEditableFields(record: Partial<AdminDanceMove>) {
  return {
    title: record.title,
    description: record.description ?? null,
    level: record.level,
    bpm: record.bpm ?? null,
    thumbnail_url: record.thumbnail_url ?? null,
    main_video_url: record.main_video_url ?? null,
    pro_dancer_video_url: record.pro_dancer_video_url ?? null,
    pro_dancer_image_url: record.pro_dancer_image_url ?? null,
    dancer_tip_video_url: record.dancer_tip_video_url ?? null,
    dancer_tip_image_url: record.dancer_tip_image_url ?? null,
    presentation_video_url: record.presentation_video_url ?? null,
    film_yourself_video_url: record.film_yourself_video_url ?? null,
    music_id: record.music_id ?? null,
    genre_ids: record.genre_ids ?? [],
    status: record.status,
    sort_order: record.sort_order,
  };
}

export function validateDanceMove(values: Partial<AdminDanceMove>) {
  if (values.status === "published" && !values.main_video_url?.trim()) {
    return { main_video_url: PUBLISHED_MOVE_VIDEO_ERROR };
  }
  return {};
}

export function MoveFormFields() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 840 }}>
      <TextInput source="title" validate={required()} fullWidth />
      <TextInput source="description" multiline minRows={3} parse={parseNullableUrl} fullWidth />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <NumberInput source="level" min={1} validate={required()} />
        <NumberInput source="bpm" min={1} />
        <NumberInput source="sort_order" validate={required()} />
      </Stack>
      <SelectInput
        source="status"
        choices={[
          { id: "draft", name: "Draft" },
          { id: "published", name: "Published" },
        ]}
        validate={required()}
        fullWidth
      />
      <ReferenceArrayInput source="genre_ids" reference="dance-genres">
        <AutocompleteArrayInput label="Genres" optionText="name" />
      </ReferenceArrayInput>
      <ReferenceInput source="music_id" reference="music-tracks">
        <AutocompleteInput
          label="Music track"
          optionText="title"
          parse={parseNullableUrl}
          fullWidth
        />
      </ReferenceInput>

      <Divider />
      <Typography variant="h6">Media URLs</Typography>
      <MediaUrlInput source="thumbnail_url" label="Thumbnail URL" preview="image" />
      <MediaUrlInput source="main_video_url" label="Main video URL" preview="link" />
      <MediaUrlInput source="pro_dancer_video_url" label="Pro dancer video URL" preview="link" />
      <MediaUrlInput source="pro_dancer_image_url" label="Pro dancer image URL" preview="image" />
      <MediaUrlInput source="dancer_tip_video_url" label="Dancer tip video URL" preview="link" />
      <MediaUrlInput source="dancer_tip_image_url" label="Dancer tip image URL" preview="image" />
      <MediaUrlInput
        source="presentation_video_url"
        label="Presentation video URL"
        preview="link"
      />
      <MediaUrlInput
        source="film_yourself_video_url"
        label="Film yourself video URL"
        preview="link"
      />
    </Stack>
  );
}
