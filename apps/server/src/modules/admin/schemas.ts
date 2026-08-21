import { z } from "zod";

export const UserIdParam = z.object({ id: z.string().uuid() });

export const UpdateUserRequest = z
  .object({ username: z.string().trim().min(3).max(32).optional() })
  .strict()
  .refine((body) => body.username !== undefined, { message: "Username is required" });

export type UpdateUserBody = z.infer<typeof UpdateUserRequest>;
