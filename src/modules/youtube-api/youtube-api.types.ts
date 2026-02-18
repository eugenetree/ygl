import { CountryCode, LanguageCode } from "../i18n/index.js";

export type Channel = {
  id: string;
  name: string;
  description: string | null;
  avatar: string;
  // TODO: maybe bring this later
  // keywords: string[];
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  countryCode: CountryCode | null;
  isFamilySafe: boolean;
  channelCreatedAt: Date;
  username: string;
  isArtist: boolean;
};

type VideoBase = {
  id: string;
  title: string;
  duration: number;
  keywords: string[];
  channelId: string;
  viewCount: number;
  thumbnail: string;
};

export type Video =
  | (VideoBase & {
    languageCode: LanguageCode;
    autoCaptions: Caption[] | null;
    manualCaptions: Caption[] | null;
  })
  | (VideoBase & {
    languageCode: null;
    autoCaptions: null;
    manualCaptions: null;
  });

export type Caption = {
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
};
