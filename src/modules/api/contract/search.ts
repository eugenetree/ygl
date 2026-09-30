import { z } from "zod";

export const MAX_SEARCH_WINDOW = 10000;

export const searchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .superRefine(({ offset, limit }, ctx) => {
    if (offset + limit <= MAX_SEARCH_WINDOW) return;
    for (const field of ["offset", "limit"]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `offset + limit must not exceed ${MAX_SEARCH_WINDOW}`,
        path: [field],
      });
    }
  });

// All times are milliseconds.
export const clipSchema = z.object({
  captionId: z.string(),
  videoId: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  playFrom: z.number(),
});

export const searchResponseSchema = z.object({
  clips: z.array(clipSchema),
  total: z.number().int(),
  isTotalExact: z.boolean(),
});

export type SearchQuery = z.input<typeof searchQuerySchema>;
export type Clip = z.infer<typeof clipSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
