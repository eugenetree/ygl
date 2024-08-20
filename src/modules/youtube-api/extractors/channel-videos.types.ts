import { LanguageCode } from "../../i18n";

export type ChannelVideos = {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  publishedAt: string;
  viewCount: number;
  likeCount?: number;
  dislikeCount?: number;
  commentCount?: number;
  duration: string;
  langCode?: LanguageCode;
}[];
