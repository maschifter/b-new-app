import type {
  DanceMediaTarget,
  DanceMediaUploadRequest,
  DanceMediaUploadTicket,
} from "@bnewapp/types";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { Button, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import { type TextInputProps, useInput, useRecordContext } from "react-admin";
import { adminApiUrl, httpClient } from "../lib/data-provider";
import { supabase } from "../lib/supabase-client";
import {
  type UploadMediaKind,
  acceptForMediaKind,
  validateMediaFile,
  validateVideoBitrate,
} from "./media-upload-guard";
import { MediaPreview, type MediaPreviewKind } from "./media-url-input";

const METADATA_TIMEOUT_MS = 10_000;

async function videoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };
    const settle = (duration: number | undefined) => {
      cleanup();
      resolve(duration);
    };
    const timeout = window.setTimeout(() => settle(undefined), METADATA_TIMEOUT_MS);
    video.preload = "metadata";
    video.onloadedmetadata = () => settle(video.duration);
    video.onerror = () => settle(undefined);
    video.src = objectUrl;
  });
}

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function imageUploadUrl(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.data)) return undefined;
  return typeof value.data.publicUrl === "string" ? value.data.publicUrl : undefined;
}

function uploadTicket(value: unknown): DanceMediaUploadTicket | undefined {
  if (!isRecord(value) || !isRecord(value.data)) return undefined;
  const { path, token, publicUrl, contentType } = value.data;
  if (
    typeof path !== "string" ||
    typeof token !== "string" ||
    typeof publicUrl !== "string" ||
    typeof contentType !== "string"
  ) {
    return undefined;
  }
  return { path, token, publicUrl, contentType };
}

interface MediaUploadInputProps extends Omit<TextInputProps, "parse" | "source"> {
  source: string;
  preview: Exclude<MediaPreviewKind, "none">;
  kind: UploadMediaKind;
  target: DanceMediaTarget;
  requirement?: "optional" | "required" | "requiredWhenPublished" | undefined;
  recordId?: string | undefined;
}

export function MediaUploadInput({
  source,
  preview,
  kind,
  target,
  requirement = "optional",
  recordId,
  label,
  validate,
}: MediaUploadInputProps) {
  const inputOptions = validate === undefined ? { source } : { source, validate };
  const { field } = useInput(inputOptions);
  const record = useRecordContext<{ id?: unknown }>();
  const resolvedRecordId = recordId ?? (typeof record?.id === "string" ? record.id : undefined);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const validationError = validateMediaFile(file, kind);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (kind === "video") {
      const bitrateError = validateVideoBitrate(file.size, await videoDuration(file));
      if (bitrateError) {
        setError(bitrateError);
        return;
      }
    }

    setUploading(true);
    setError(undefined);
    try {
      let publicUrl: string;
      if (kind === "image") {
        const body = new FormData();
        body.append("file", file);
        const params = new URLSearchParams({ target, field: source });
        if (resolvedRecordId) params.set("recordId", resolvedRecordId);
        const response = await httpClient(`${adminApiUrl}/dance-media/images?${params}`, {
          method: "POST",
          body,
        });
        const url = imageUploadUrl(response.json);
        if (!url) throw new Error("Invalid image upload response");
        publicUrl = url;
      } else {
        const request: DanceMediaUploadRequest = {
          target,
          field: source,
          filename: file.name,
          ...(resolvedRecordId ? { recordId: resolvedRecordId } : {}),
        };
        const response = await httpClient(`${adminApiUrl}/dance-media/uploads`, {
          method: "POST",
          body: JSON.stringify(request),
          headers: new Headers({ "Content-Type": "application/json" }),
        });
        const ticket = uploadTicket(response.json);
        if (!ticket) throw new Error("Invalid upload ticket response");
        const { error: storageError } = await supabase.storage
          .from("dance-media")
          .uploadToSignedUrl(ticket.path, ticket.token, file, {
            contentType: ticket.contentType,
            cacheControl: "31536000, immutable",
          });
        if (storageError) throw new Error(storageError.message);
        publicUrl = ticket.publicUrl;
      }
      field.onChange(publicUrl);
    } catch (uploadError) {
      setError(errorMessage(uploadError, "Could not upload media"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Stack spacing={1}>
      {label ? (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="subtitle2">{label}</Typography>
          {requirement === "requiredWhenPublished" ? (
            <Tooltip title="Required when published">
              <Typography component="span" color="error" aria-label="Required when published">
                *
              </Typography>
            </Tooltip>
          ) : requirement === "required" ? (
            <Typography component="span" color="error" aria-label="Required">
              *
            </Typography>
          ) : null}
        </Stack>
      ) : null}
      <MediaPreview url={field.value} kind={preview} />
      <Button
        component="label"
        variant="outlined"
        startIcon={uploading ? <CircularProgress size={18} /> : <CloudUploadIcon />}
        disabled={uploading}
        sx={{ alignSelf: "flex-start" }}
      >
        {uploading ? "Uploading…" : `Upload ${kind}`}
        <input
          hidden
          type="file"
          accept={acceptForMediaKind(kind)}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void upload(file);
          }}
        />
      </Button>
      {error ? (
        <Typography color="error" role="alert">
          {error}
        </Typography>
      ) : null}
    </Stack>
  );
}
