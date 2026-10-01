import { z } from "zod";

export const videoCaptionsParamsSchema = z.object({
  videoId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{11}$/, "must be an 11-character YouTube video id"),
});

// All times are milliseconds.
export const videoCaptionSchema = z.object({
  captionId: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
});

export const videoCaptionsResponseSchema = z.object({
  captions: z.array(videoCaptionSchema),
});

export type VideoCaption = z.infer<typeof videoCaptionSchema>;
export type VideoCaptionsResponse = z.infer<typeof videoCaptionsResponseSchema>;
