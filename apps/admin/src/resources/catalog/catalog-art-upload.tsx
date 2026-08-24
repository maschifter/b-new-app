import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import CloseIcon from "@mui/icons-material/Close";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import EditIcon from "@mui/icons-material/Edit";
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useNotify, useRecordContext, useRefresh } from "react-admin";
import { adminApiUrl, httpClient } from "../../lib/data-provider";
import type { CatalogRecord } from "./catalog-types";

interface CatalogArtUploadButtonProps {
  compact?: boolean;
  variant?: "button" | "edit-icon" | "placeholder";
}

interface HitBox {
  size: { width: number; height: number };
  opaqueBounds: { x: number; y: number; width: number; height: number };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hitBox(value: unknown): HitBox | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("size" in value) || !("opaqueBounds" in value)) return null;
  const size = value.size;
  const bounds = value.opaqueBounds;
  if (typeof size !== "object" || size === null) return null;
  if (typeof bounds !== "object" || bounds === null) return null;
  if (!("width" in size) || !("height" in size)) return null;
  if (!("x" in bounds) || !("y" in bounds) || !("width" in bounds) || !("height" in bounds)) {
    return null;
  }
  if (
    !isFiniteNumber(size.width) ||
    !isFiniteNumber(size.height) ||
    !isFiniteNumber(bounds.x) ||
    !isFiniteNumber(bounds.y) ||
    !isFiniteNumber(bounds.width) ||
    !isFiniteNumber(bounds.height)
  ) {
    return null;
  }
  return {
    size: { width: size.width, height: size.height },
    opaqueBounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
  };
}

export function CatalogArtUploadButton({
  compact = false,
  variant = "button",
}: CatalogArtUploadButtonProps) {
  const record = useRecordContext<CatalogRecord>();
  const refresh = useRefresh();
  const notify = useNotify();
  const [uploading, setUploading] = useState(false);
  if (!record) return null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    try {
      await httpClient(`${adminApiUrl}/catalog/${encodeURIComponent(record.id)}/art`, {
        method: "POST",
        body,
      });
      notify("Catalog art uploaded", { type: "success" });
      refresh();
    } catch {
      notify("Could not upload catalog art", { type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const label = compact
    ? record.art_url
      ? "Replace art"
      : "Upload art"
    : "Upload PNG, JPEG, or WEBP";

  const fileInput = (
    <input
      hidden
      type="file"
      accept="image/png,image/jpeg,image/webp"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        void upload(file);
      }}
    />
  );

  if (variant === "placeholder") {
    return (
      <Tooltip title="Upload art">
        <ButtonBase
          component="label"
          aria-label={`Upload art for ${record.display_name}`}
          disabled={uploading}
          onClick={(event) => event.stopPropagation()}
          sx={{
            width: 56,
            height: 56,
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 1,
            color: "text.secondary",
          }}
        >
          {uploading ? <CircularProgress size={22} /> : <AddPhotoAlternateOutlinedIcon />}
          {fileInput}
        </ButtonBase>
      </Tooltip>
    );
  }

  if (variant === "edit-icon") {
    return (
      <Tooltip title="Replace art">
        <IconButton
          component="label"
          aria-label={`Replace art for ${record.display_name}`}
          size="small"
          disabled={uploading}
          onClick={(event) => event.stopPropagation()}
          sx={{
            position: "absolute",
            top: -8,
            right: -8,
            width: 24,
            height: 24,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: 1,
            "&:hover": { bgcolor: "background.paper" },
          }}
        >
          {uploading ? <CircularProgress size={14} /> : <EditIcon sx={{ fontSize: 15 }} />}
          {fileInput}
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Button
      component="label"
      variant="outlined"
      size={compact ? "small" : "medium"}
      startIcon={uploading ? <CircularProgress size={18} /> : <CloudUploadIcon />}
      disabled={uploading}
      onClick={(event) => event.stopPropagation()}
      sx={compact ? { whiteSpace: "nowrap" } : undefined}
    >
      {uploading ? "Uploading…" : label}
      {fileInput}
    </Button>
  );
}

export function CatalogArtCell() {
  const record = useRecordContext<CatalogRecord>();
  const [viewerOpen, setViewerOpen] = useState(false);
  if (!record) return null;

  if (!record.art_url) return <CatalogArtUploadButton variant="placeholder" />;

  const titleId = `catalog-art-viewer-${record.id}`;

  return (
    <Box
      sx={{ position: "relative", width: 56, height: 56 }}
      onClick={(event) => event.stopPropagation()}
    >
      <Tooltip title="View art">
        <ButtonBase
          aria-label={`View art for ${record.display_name}`}
          onClick={() => setViewerOpen(true)}
          sx={{ width: 56, height: 56, borderRadius: 1 }}
        >
          <Box
            component="img"
            src={record.art_url}
            alt={`${record.display_name} catalog art`}
            sx={{ width: 56, height: 56, objectFit: "contain" }}
          />
        </ButtonBase>
      </Tooltip>
      <CatalogArtUploadButton variant="edit-icon" />
      <Dialog
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        aria-labelledby={titleId}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle id={titleId}>{record.display_name}</DialogTitle>
        <IconButton
          aria-label="Close image viewer"
          onClick={() => setViewerOpen(false)}
          sx={{ position: "absolute", top: 8, right: 8 }}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent dividers sx={{ display: "flex", justifyContent: "center" }}>
          <Box
            component="img"
            src={record.art_url}
            alt={`${record.display_name} catalog art preview`}
            sx={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
          />
        </DialogContent>
        <DialogActions>
          <CatalogArtUploadButton compact />
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export function CatalogArtUpload() {
  const record = useRecordContext<CatalogRecord>();
  if (!record) return null;

  const bounds = hitBox(record.art_hitbox);
  const overlay = bounds
    ? {
        left: `${(bounds.opaqueBounds.x / bounds.size.width) * 100}%`,
        top: `${(bounds.opaqueBounds.y / bounds.size.height) * 100}%`,
        width: `${(bounds.opaqueBounds.width / bounds.size.width) * 100}%`,
        height: `${(bounds.opaqueBounds.height / bounds.size.height) * 100}%`,
      }
    : null;

  return (
    <Stack spacing={2} sx={{ mt: 3, maxWidth: 560 }}>
      <Typography variant="h6">Art</Typography>
      {record.art_url ? (
        <Box sx={{ position: "relative", alignSelf: "flex-start", lineHeight: 0 }}>
          <Box
            component="img"
            src={record.art_url}
            alt={`${record.display_name} catalog art`}
            sx={{ display: "block", maxWidth: 360, maxHeight: 360, objectFit: "contain" }}
          />
          {overlay ? (
            <Box
              aria-label="Detected opaque hit-box"
              sx={{
                position: "absolute",
                border: "2px solid",
                borderColor: "warning.main",
                ...overlay,
              }}
            />
          ) : null}
        </Box>
      ) : (
        <Typography color="text.secondary">
          No remote art. This item is hidden on mobile until an image is uploaded.
        </Typography>
      )}
      {bounds ? (
        <Typography variant="body2" color="text.secondary">
          Hit-box: {bounds.opaqueBounds.x}, {bounds.opaqueBounds.y}, {bounds.opaqueBounds.width} ×{" "}
          {bounds.opaqueBounds.height} in {bounds.size.width} × {bounds.size.height}px
        </Typography>
      ) : null}
      <CatalogArtUploadButton />
      <Typography variant="caption" color="text.secondary">
        Maximum 5 MiB and 4096px per edge. The server stores a metadata-free WEBP capped at 1024px.
      </Typography>
    </Stack>
  );
}
