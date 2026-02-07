import { z } from "zod";

import { CountryCode } from "../i18n/index.js";

export type VideoInfo = {
  id: string;
  title: string;
  thumbnail?: string;
  viewCount: number;
  duration: string;
};

export type ChannelInfo = {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  keywords: string[];
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  countryCode?: CountryCode;
};

const channelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  thumbnail: z.string().optional(),
  keywords: z.array(z.string()),
  subscriberCount: z.number(),
  viewCount: z.number(),
  videoCount: z.number(),
  countryCode: z.string().optional(),
});
