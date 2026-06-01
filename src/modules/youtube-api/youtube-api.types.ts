import type { CountryCode, LanguageCode } from "../i18n/index.js";

export type Channel = {
  id: string;
  name: string;
  description: string | null;
  avatar: string;
  keywords: string[];
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
  languageCodeYtdlp: string | null;
  asr: number | null;
  abr: number | null;
  acodec: string | null;
  audioChannels: number | null;
  audioQuality: string | null;
  isDrc: boolean | null;
  categories: string[];
  track: string | null;
  artist: string | null;
  album: string | null;
  creator: string | null;
  uploadedAt: Date | null;
  description: string | null;
  likeCount: number | null;
  commentCount: number | null;
  availability: string | null;
  playableInEmbed: boolean | null;
  channelIsVerified: boolean | null;
  liveStatus: string | null;
  ageLimit: number | null;
  mediaType: string | null;
};

export type CaptionTrackState =
  | { state: "FETCHED"; data: Caption[] }
  | { state: "PRESENT_NOT_FETCHED" }
  | { state: "ABSENT" };

export type Video = VideoBase & {
  languageCode: LanguageCode | null;
  autoCaptions: CaptionTrackState;
  manualCaptions: CaptionTrackState;
};

export type Caption = {
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
};
