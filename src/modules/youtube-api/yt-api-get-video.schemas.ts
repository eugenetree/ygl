import { z } from "zod";

export const inputSchemas = {
  ytDlpJson: z.object({
    id: z.string(),
    title: z.string(),
    duration: z.number().int(),
    tags: z.array(z.string()).optional().default([]),
    channel_id: z.string(),
    view_count: z.number().int().optional().default(0),
    thumbnail: z.string(),
    language: z.string().optional().nullable(),
    subtitles: z.record(
      z.array(
        z.object({
          ext: z.string(),
          url: z.string(),
        })
      )
    ).optional(),
    automatic_captions: z.record(
      z.array(
        z.object({
          ext: z.string(),
          url: z.string(),
        })
      )
    ).optional(),
  }),
};
