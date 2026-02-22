import { z } from "zod";

import { getZodEnumFromObjectKeys } from "../../_common/validation/helpers.js";
import { LanguageCode } from "../../i18n/index.js";

const thumbnailsSchema = z.array(
  z.object({
    url: z.string(),
  }),
);

const captionTrack = z.object({
  baseUrl: z.string(),
  languageCode: z.string(),
  kind: z.literal("asr").optional(),
});

const playerResponse = z.object({
  captions: z.object({
    playerCaptionsTracklistRenderer: z
      .object({
        captionTracks: z.array(z.unknown()),
      })
      .optional(),
  }),
  videoDetails: z.object({
    videoId: z.string(),
    title: z.string(),
    lengthSeconds: z.string(),
    keywords: z.array(z.string()).optional(),
    channelId: z.string(),
    viewCount: z.string(),
    thumbnail: z.object({
      thumbnails: thumbnailsSchema,
    }),
  }),

});

const video = z.object({
  id: z.string(),
  title: z.string(),
  duration: z.number(),
  keywords: z.array(z.string()),
  channelId: z.string(),
  viewCount: z.number(),
  thumbnail: z.string(),
  captionTracksUrls: z.record(
    getZodEnumFromObjectKeys(LanguageCode),
    z.object({
      auto: z.string().nullable(),
      manual: z.string().nullable(),
    }),
  ),
});

export const inputSchemas = {
  playerResponse,
  captionTrack,
};

export const outputSchemas = {
  video,
};
