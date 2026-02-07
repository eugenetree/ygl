import { LanguageCode } from "../i18n/index.js";

export type Video = {
  id: string;
  title: string;
  duration: number;
  keywords: string[];
  viewCount: number;
  thumbnail: string;
  languageCode: LanguageCode;
  captionType: "manual" | "auto";
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
};
