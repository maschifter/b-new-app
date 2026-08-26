import { Link, Stack } from "@mui/material";
import { FormDataConsumer, TextInput, type TextInputProps } from "react-admin";

export type MediaPreviewKind = "audio" | "image" | "link" | "none";

export function previewKind(
  url: unknown,
  requestedKind: Exclude<MediaPreviewKind, "none">,
): MediaPreviewKind {
  if (typeof url !== "string" || url.trim() === "") return "none";
  try {
    new URL(url);
    return requestedKind;
  } catch {
    return "none";
  }
}

export function parseNullableUrl(value: string | null | undefined) {
  return value === "" || value === undefined ? null : value;
}

export function MediaPreview({
  url,
  kind,
  compact = false,
}: {
  url: unknown;
  kind: Exclude<MediaPreviewKind, "none">;
  compact?: boolean;
}) {
  const preview = previewKind(url, kind);
  if (preview === "none" || typeof url !== "string") return null;
  if (preview === "image") {
    return (
      <img
        src={url}
        alt="Media preview"
        style={{
          display: "block",
          width: compact ? 48 : 180,
          height: compact ? 48 : 120,
          objectFit: "cover",
          borderRadius: 6,
        }}
      />
    );
  }
  if (preview === "audio") {
    // biome-ignore lint/a11y/useMediaCaption: Music-track previews do not contain spoken content.
    return <audio src={url} controls preload="none" style={{ width: "100%", maxWidth: 520 }} />;
  }
  return (
    <Link href={url} target="_blank" rel="noreferrer">
      Open media in a new tab
    </Link>
  );
}

interface MediaUrlInputProps extends Omit<TextInputProps, "parse" | "source"> {
  source: string;
  preview: Exclude<MediaPreviewKind, "none">;
}

export function MediaUrlInput({ source, preview, ...props }: MediaUrlInputProps) {
  return (
    <Stack spacing={1}>
      <TextInput source={source} parse={parseNullableUrl} fullWidth {...props} />
      <FormDataConsumer>
        {({ formData }) => <MediaPreview url={formData[source]} kind={preview} />}
      </FormDataConsumer>
    </Stack>
  );
}
