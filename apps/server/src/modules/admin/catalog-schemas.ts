import { z } from "zod";

const catalogId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const tagValue = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
const tags = z.record(tagValue);

const ACCESS_PRICE_ERROR =
  "Free items must have no price; premium items require a positive Glow price";

function hasValidAccessPrice(value: {
  access?: "free" | "premium" | undefined;
  price?: number | null | undefined;
}): boolean {
  if (value.access === "free") {
    return value.price === undefined || value.price === null || value.price === 0;
  }
  if (value.access === "premium") return value.price !== null && (value.price ?? 0) > 0;
  return true;
}

function hasValidPartialAccessPrice(value: {
  access?: "free" | "premium" | undefined;
  price?: number | null | undefined;
}): boolean {
  return value.access === undefined || value.price === undefined || hasValidAccessPrice(value);
}

const editableCatalogFields = z.object({
  tags,
  display_name: z.string().trim().min(1).max(120),
  status: z.enum(["draft", "published"]),
  access: z.enum(["free", "premium"]),
  price: z.number().int().nonnegative().nullable().optional(),
  sort_order: z.number().int(),
});

// Derived from the schema above so a new editable field cannot be accepted by the
// request and then silently dropped from the row update.
export const CATALOG_ITEM_UPDATE_COLUMNS = editableCatalogFields.keyof().options;

export const CatalogIdParam = z.object({ id: catalogId });

export const CreateCatalogItemRequest = editableCatalogFields
  .extend({ id: catalogId })
  .strict()
  .refine(hasValidAccessPrice, { message: ACCESS_PRICE_ERROR });

export const UpdateCatalogItemRequest = editableCatalogFields
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "No editable fields supplied" })
  .refine(hasValidPartialAccessPrice, { message: ACCESS_PRICE_ERROR });

export type CreateCatalogItemBody = z.infer<typeof CreateCatalogItemRequest>;
export type UpdateCatalogItemBody = z.infer<typeof UpdateCatalogItemRequest>;
