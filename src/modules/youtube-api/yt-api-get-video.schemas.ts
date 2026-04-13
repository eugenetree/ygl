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
    categories: z.array(z.string()).optional().default([]),
    track: z.string().optional().nullable(),
    artist: z.string().optional().nullable(),
    album: z.string().optional().nullable(),
    creator: z.string().optional().nullable(),
    timestamp: z.number().int().optional().nullable(),
    description: z.string().optional().nullable(),
    like_count: z.number().int().optional().nullable(),
    comment_count: z.number().int().optional().nullable(),
    availability: z.string().optional().nullable(),
    playable_in_embed: z.boolean().optional().nullable(),
    channel_is_verified: z.boolean().optional().nullable(),
    live_status: z.string().optional().nullable(),
    age_limit: z.number().int().optional().nullable(),
    media_type: z.string().optional().nullable(),
  }),
};
