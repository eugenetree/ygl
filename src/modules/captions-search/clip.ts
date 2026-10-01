import type { Caption } from "../scraping/scrapers/video/caption.js";

const PLAY_FROM_BEFORE_CAPTION_MS = 1000;

// All times are milliseconds.
export type Clip = {
  captionId: string;
  videoId: string;
  startTime: number;
  endTime: number;
  text: string;
  playFrom: number;
};

// All times are milliseconds.
export type VideoCaption = {
  captionId: string;
  startTime: number;
  endTime: number;
  text: string;
};

export type ClipSearchResult = {
  clips: Clip[];
  total: number;
  isTotalExact: boolean;
};

export function toClip(
  caption: Pick<Caption, "id" | "videoId" | "startTime" | "endTime" | "text">,
): Clip {
  return {
    captionId: caption.id,
    videoId: caption.videoId,
    startTime: caption.startTime,
    endTime: caption.endTime,
    text: caption.text,
    playFrom: Math.max(0, caption.startTime - PLAY_FROM_BEFORE_CAPTION_MS),
  };
}
