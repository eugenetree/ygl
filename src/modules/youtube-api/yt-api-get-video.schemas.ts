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
    asr: z.number().int().optional().nullable(),
    abr: z.number().optional().nullable(),
    acodec: z.string().optional().nullable(),
    audio_channels: z.number().int().optional().nullable(),
    audio_quality: z.string().optional().nullable(),
    is_drc: z.boolean().optional().nullable(),
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
