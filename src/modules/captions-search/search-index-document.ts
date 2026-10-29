import type { CaptionRow } from "../../db/types.js";
import {
  countWords,
  endsSentence,
  startsSentence,
} from "./caption-features.js";

/** A caption as the search index stores it. Times are milliseconds. */
export type SearchIndexDocument = {
  id: string;
  videoId: string;
  channelId: string;
  startTime: number;
  endTime: number;
  text: string;
  wordCount: number;
  startsSentence: boolean;
  endsSentence: boolean;
};

export function toSearchIndexDocument(
  caption: Pick<
    CaptionRow,
    "id" | "videoId" | "startTime" | "endTime" | "text"
  >,
  channelId: string,
): SearchIndexDocument {
  return {
    id: caption.id,
    videoId: caption.videoId,
    channelId,
    startTime: caption.startTime,
    endTime: caption.endTime,
    text: caption.text,
    wordCount: countWords(caption.text),
    startsSentence: startsSentence(caption.text),
    endsSentence: endsSentence(caption.text),
  };
}
