import { LanguageCode } from "../../i18n/index.js";

export type AutoCaptionsStatus =
  | "CAPTIONS_ABSENT"
  | "CAPTIONS_VALID"
  | "CAPTIONS_EMPTY"
  | "CAPTIONS_TOO_SHORT";

export type ManualCaptionsStatus =
  | "CAPTIONS_ABSENT"
  | "CAPTIONS_VALID"
  | "CAPTIONS_PENDING_VALIDATION"
  | "CAPTIONS_EMPTY"
  | "CAPTIONS_TOO_SHORT"
  | "CAPTIONS_MOSTLY_UPPERCASE"
  | "CAPTIONS_HAS_OVERLAPPING_TIMESTAMPS"

export type Video = {
  id: string;
  title: string;
  duration: number;
  keywords: string[];
  viewCount: number;
  thumbnail: string;
  languageCode: LanguageCode | null;
  autoCaptionsStatus: AutoCaptionsStatus;
  manualCaptionsStatus: ManualCaptionsStatus;
  captionsSimilarityScore: number | null;
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
  captionsShift: number | null;
  channelId: string;
  uploadedAt: Date | null;
  description: string | null;
  likeCount: number | null;
  commentCount: number | null;
  availability: string | null;
  playableInEmbed: boolean | null;
  channelIsVerified: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

export type VideoProps = Omit<Video, "createdAt" | "updatedAt">;

