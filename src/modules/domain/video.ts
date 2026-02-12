import { LanguageCode } from "../i18n/index.js";

export type Video = {
  id: string;
  title: string;
  duration: number;
  keywords: string[];
  viewCount: number;
  thumbnail: string;
  languageCode: LanguageCode;
  hasAutoCaptions: boolean;
  hasManualCaptions: boolean;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
};
