import { z } from "zod";

export const meResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
