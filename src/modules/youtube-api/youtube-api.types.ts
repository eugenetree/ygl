import { CountryCode } from "../i18n";

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
