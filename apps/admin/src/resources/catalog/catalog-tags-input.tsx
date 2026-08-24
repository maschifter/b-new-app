import {
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { useRef, useState } from "react";
import { useInput } from "react-admin";
import { CATALOG_ITEM_TYPES } from "./catalog-types";

type Tags = Record<string, string | string[]>;

export const EXTRA_TAGS_ERROR =
  "Enter a JSON object whose values are strings or non-empty string arrays.";

function parseExtraTagsDraft(draft: string): Tags | null {
  try {
    const parsed: unknown = JSON.parse(draft || "{}");
    return isTags(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function validateExtraTagsDraft(draft: string): string | undefined {
  return parseExtraTagsDraft(draft) === null ? EXTRA_TAGS_ERROR : undefined;
}

function isTags(value: unknown): value is Tags {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (tag) =>
        (typeof tag === "string" && tag.length > 0) ||
        (Array.isArray(tag) &&
          tag.length > 0 &&
          tag.every((item) => typeof item === "string" && item.length > 0)),
    )
  );
}

function extraTags(tags: Tags): Tags {
  return Object.fromEntries(Object.entries(tags).filter(([key]) => key !== "type" && key !== "size"));
}

function firstTag(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function CatalogTagsInput() {
  const extraDraftRef = useRef("{}");
  const { field } = useInput<Tags>({
    source: "tags",
    validate: () => validateExtraTagsDraft(extraDraftRef.current),
  });
  const tags = isTags(field.value) ? field.value : {};
  const [extraDraft, setExtraDraft] = useState(() => {
    const initialDraft = JSON.stringify(extraTags(tags), null, 2);
    extraDraftRef.current = initialDraft;
    return initialDraft;
  });
  const [extraError, setExtraError] = useState<string | null>(null);

  const updateFixedTag = (key: "type" | "size", value: string) => {
    const next = { ...tags };
    if (value) next[key] = value;
    else delete next[key];
    field.onChange(next);
  };

  const updateExtraTags = (draft: string) => {
    setExtraDraft(draft);
    extraDraftRef.current = draft;
    const parsed = parseExtraTagsDraft(draft);
    if (parsed === null) {
      field.onChange(tags);
      setExtraError(EXTRA_TAGS_ERROR);
      return;
    }
    const { type: _ignoredType, size: _ignoredSize, ...extras } = parsed;
    field.onChange({
      ...extras,
      ...(tags.type === undefined ? {} : { type: tags.type }),
      ...(tags.size === undefined ? {} : { size: tags.size }),
    });
    setExtraError(null);
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <FormControl required>
        <InputLabel id="catalog-type-label">Type</InputLabel>
        <Select
          labelId="catalog-type-label"
          label="Type"
          value={firstTag(tags.type)}
          onChange={(event) => updateFixedTag("type", event.target.value)}
        >
          {CATALOG_ITEM_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              {type}
            </MenuItem>
          ))}
        </Select>
        <FormHelperText>Must match a studio spot accept rule.</FormHelperText>
      </FormControl>

      <FormControl>
        <InputLabel id="catalog-size-label">Size</InputLabel>
        <Select
          labelId="catalog-size-label"
          label="Size"
          value={firstTag(tags.size)}
          onChange={(event) => updateFixedTag("size", event.target.value)}
        >
          <MenuItem value="">None</MenuItem>
          {(["S", "M", "L"] as const).map((size) => (
            <MenuItem key={size} value={size}>
              {size}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        label="Additional tags (JSON)"
        value={extraDraft}
        onChange={(event) => updateExtraTags(event.target.value)}
        error={extraError !== null}
        helperText={extraError ?? 'Example: { "theme": ["street", "neon"] }'}
        minRows={3}
        multiline
      />
    </Stack>
  );
}
