import type { RaRecord } from "react-admin";

export const CATALOG_ITEM_TYPES = [
  "video",
  "preview",
  "tall",
  "low",
  "lounge",
  "ceiling",
  "floor",
  "wall",
  "decor",
] as const;

export interface CatalogRecord extends RaRecord {
  id: string;
  tags: Record<string, string | string[]>;
  display_name: string;
  art_url: string | null;
  art_hitbox: unknown;
  status: "draft" | "published";
  access: "free" | "premium";
  price: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
