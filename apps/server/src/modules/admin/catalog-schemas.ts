import { z } from "zod";

const catalogId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const tagValue = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
const tags = z.record(tagValue);

const editableCatalogFields = z.object({
  tags,
  display_name: z.string().trim().min(1).max(120),
  status: z.enum(["draft", "published"]),
  access: z.enum(["free", "premium"]),
  price: z.number().int().nonnegative().nullable().optional(),
  sort_order: z.number().int(),
});

export const CatalogIdParam = z.object({ id: catalogId });

export const CreateCatalogItemRequest = editableCatalogFields.extend({ id: catalogId }).strict();

export const UpdateCatalogItemRequest = editableCatalogFields
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "No editable fields supplied" });

export type CreateCatalogItemBody = z.infer<typeof CreateCatalogItemRequest>;
export type UpdateCatalogItemBody = z.infer<typeof UpdateCatalogItemRequest>;
