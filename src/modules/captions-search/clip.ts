import type { Caption } from "../scraping/scrapers/video/caption.js";

const PLAY_FROM_BEFORE_CAPTION_MS = 1000;

export type ClipVideo = {
  id: string;
  title: string;
  channel: { name: string };
};

// All times are milliseconds.
export type Clip = {
  captionId: string;
  video: ClipVideo;
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
  caption: Pick<Caption, "id" | "startTime" | "endTime" | "text">,
  video: ClipVideo,
): Clip {
  return {
    captionId: caption.id,
    video,
    startTime: caption.startTime,
    endTime: caption.endTime,
    text: caption.text,
    playFrom: Math.max(0, caption.startTime - PLAY_FROM_BEFORE_CAPTION_MS),
  };
}
