import { z } from "zod";

const uuid = z.string().uuid();

export const DanceMediaUploadRequest = z
  .object({
    target: z.enum(["move", "track"]),
    field: z.string().min(1).max(100),
    recordId: uuid.optional(),
    filename: z.string().min(1).max(255),
  })
  .strict();

export const DanceMediaImageQuery = z
  .object({
    target: z.enum(["move", "track"]),
    field: z.string().min(1).max(100),
    recordId: uuid.optional(),
  })
  .strict();

export type DanceMediaUploadBody = z.infer<typeof DanceMediaUploadRequest>;
export type DanceMediaImageQueryBody = z.infer<typeof DanceMediaImageQuery>;
