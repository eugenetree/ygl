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
    captionStatus: "NONE";
    languageCode: null;
    autoCaptions: null;
    manualCaptions: null;
  })
  | (VideoBase & {
    captionStatus: "MANUAL_ONLY";
    languageCode: null;
    autoCaptions: null;
    manualCaptions: null;
  })
  | (VideoBase & {
    captionStatus: "AUTO_ONLY";
    languageCode: LanguageCode;
    autoCaptions: Caption[];
    manualCaptions: null;
  })
  | (VideoBase & {
    captionStatus: "BOTH";
    languageCode: LanguageCode;
    autoCaptions: Caption[];
    manualCaptions: Caption[];
  });

export type Caption = {
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
};
