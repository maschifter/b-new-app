import { readQueryAuth } from "@bnewapp/mobile-kit";
import { fallbackCatalog } from "@bnewapp/studio-core";
import type { CatalogItemDTO, StudioCatalog } from "@bnewapp/types";
import { Image } from "expo-image";
import { atom } from "jotai";
import { atomWithQuery } from "jotai-tanstack-query";
import { MMKV } from "react-native-mmkv";
import { getCatalog } from "../api";

const CACHE_PREFIX = "catalog:v1:";
const catalogStorage = new MMKV({ id: "catalog" });

const FALLBACK_CATALOG: StudioCatalog = fallbackCatalog();

function isStringTags(value: unknown): value is Record<string, string | string[]> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (tag) =>
        typeof tag === "string" ||
        (Array.isArray(tag) && tag.every((entry) => typeof entry === "string")),
    )
  );
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isHitBox(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (!("size" in value) || !("opaqueBounds" in value)) return false;
  const size = value.size;
  const bounds = value.opaqueBounds;
  if (typeof size !== "object" || size === null) return false;
  if (typeof bounds !== "object" || bounds === null) return false;
  return (
    "width" in size &&
    isNumber(size.width) &&
    "height" in size &&
    isNumber(size.height) &&
    "x" in bounds &&
    isNumber(bounds.x) &&
    "y" in bounds &&
    isNumber(bounds.y) &&
    "width" in bounds &&
    isNumber(bounds.width) &&
    "height" in bounds &&
    isNumber(bounds.height)
  );
}

function isArt(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (!("url" in value) || typeof value.url !== "string") return false;
  return !("hitbox" in value) || value.hitbox === undefined || isHitBox(value.hitbox);
}

function isCatalogItem(value: unknown): value is CatalogItemDTO {
  if (typeof value !== "object" || value === null) return false;
  if (!("id" in value) || typeof value.id !== "string") return false;
  if (!("name" in value) || typeof value.name !== "string") return false;
  if (!("tags" in value) || !isStringTags(value.tags)) return false;
  if (!("status" in value) || !["draft", "published"].includes(String(value.status))) return false;
  if (!("access" in value) || !["free", "premium"].includes(String(value.access))) return false;
  if ("price" in value && value.price !== undefined && !isNumber(value.price)) return false;
  return !("art" in value) || value.art === undefined || isArt(value.art);
}

function cachedCatalog(userId: string | undefined): StudioCatalog {
  if (!userId) return FALLBACK_CATALOG;
  const raw = catalogStorage.getString(`${CACHE_PREFIX}${userId}`);
  if (!raw) return FALLBACK_CATALOG;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "version" in value &&
      Number.isSafeInteger(value.version) &&
      "items" in value &&
      Array.isArray(value.items) &&
      value.items.every(isCatalogItem)
    ) {
      return { version: Number(value.version), items: value.items };
    }
  } catch {
    // Corrupt cache is equivalent to a first cold start; use the bundled seed.
  }
  return FALLBACK_CATALOG;
}

function persistCatalog(userId: string, catalog: StudioCatalog): void {
  catalogStorage.set(`${CACHE_PREFIX}${userId}`, JSON.stringify(catalog));
  const remoteUrls = catalog.items.flatMap((item) => (item.art?.url ? [item.art.url] : []));
  if (remoteUrls.length > 0) void Image.prefetch(remoteUrls, "memory-disk");
}

export const catalogAtom = atomWithQuery<StudioCatalog>((get) => {
  const auth = readQueryAuth(get);
  return {
    queryKey: ["studio-catalog", auth?.userId ?? null],
    enabled: auth !== null,
    initialData: cachedCatalog(auth?.userId),
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
    queryFn: async () => {
      if (!auth) return FALLBACK_CATALOG;
      const catalog = await getCatalog(auth.accessToken);
      persistCatalog(auth.userId, catalog);
      return catalog;
    },
  };
});

const fallbackById = new Map(FALLBACK_CATALOG.items.map((item) => [item.id, item]));

export const catalogItemByIdAtom = atom((get) => {
  const items = get(catalogAtom).data?.items;
  return items ? new Map(items.map((item) => [item.id, item])) : fallbackById;
});
