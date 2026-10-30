import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type CaptionToIndex,
  toSearchIndexDocument,
} from "./search-index-document.js";

const caption = (overrides: Partial<CaptionToIndex> = {}): CaptionToIndex => ({
  id: "caption-1",
  videoId: "video-1",
  channelId: "channel-1",
  startTime: 2500,
  endTime: 4200,
  text: "Strange.",
  ...overrides,
});

describe("toSearchIndexDocument()", () => {
  it("holds the caption's times, its video and channel, and its features", () => {
    const document = toSearchIndexDocument(
      caption({ text: "- So is it a custom dish?" }),
    );

    assert.deepEqual(document, {
      id: "caption-1",
      videoId: "video-1",
      channelId: "channel-1",
      startTime: 2500,
      endTime: 4200,
      text: "- So is it a custom dish?",
      wordCount: 6,
      startsSentence: true,
      endsSentence: true,
    });
  });

  it("keeps the text exactly as stored, markup and all", () => {
    const text = " <i>&quot;Strange\xA0things,&quot;\u{200B} he said.</i>\n";

    const document = toSearchIndexDocument(caption({ text }));

    assert.equal(document.text, text);
    assert.deepEqual(
      {
        wordCount: document.wordCount,
        startsSentence: document.startsSentence,
        endsSentence: document.endsSentence,
      },
      { wordCount: 4, startsSentence: true, endsSentence: true },
    );
  });
});
