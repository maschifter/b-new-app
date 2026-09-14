import { z } from "zod";

const cursorSchema = z.object({
  sortOrder: z.number().int(),
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export type DanceMovesCursor = z.infer<typeof cursorSchema>;

export const DanceMoveIdParams = z.object({
  id: z.string().uuid(),
});

export const DancePostIdParams = z.object({
  id: z.string().uuid(),
});

export const CreateDancePostRequest = z.object({
  danceMoveId: z.string().uuid(),
  videoLength: z.coerce.number().finite().positive().max(600),
});

export const DanceMovesQuery = z.object({
  genre_id: z.string().uuid().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const DancePostsQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(18),
});

export function decodeDanceMovesCursor(value: string): DanceMovesCursor | null {
  try {
    return cursorSchema.parse(JSON.parse(value));
  } catch {
    try {
      const decoded = Buffer.from(value, "base64url").toString("utf8");
      return cursorSchema.parse(JSON.parse(decoded));
    } catch {
      return null;
    }
  }
}

export function encodeDanceMovesCursor(cursor: DanceMovesCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export interface DancePostsCursor {
  createdAt: string;
  id: string;
}

const postsCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export function decodeDancePostsCursor(value: string): DancePostsCursor | null {
  try {
    return postsCursorSchema.parse(JSON.parse(value));
  } catch {
    try {
      return postsCursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    } catch {
      return null;
    }
  }
}
