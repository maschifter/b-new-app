import { Link } from "@mui/material";

export type MediaPreviewKind = "audio" | "image" | "link" | "video" | "none";

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
  if (preview === "video") {
    // biome-ignore lint/a11y/useMediaCaption: Dance-video previews do not contain spoken content.
    return <video src={url} controls preload="metadata" style={{ width: "100%", maxWidth: 520 }} />;
  }
  return (
    <Link href={url} target="_blank" rel="noreferrer">
      Open media in a new tab
    </Link>
  );
}
