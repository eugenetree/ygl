import { LanguageCode } from "../i18n/index.js";

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
  | "CAPTIONS_LOW_SIMILARITY_WITH_AUTO";

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
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
};

