import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import {
  countWords,
  endsSentence,
  startsSentence,
} from "./caption-features.js";
import { CaptionsService, type StoredCaption } from "./captions.service.js";
import type { CaptionToIndex } from "./search-index-document.js";
import { useTestSearchIndex } from "./testing/test-elasticsearch.js";

// Captions as they come in real videos, the weakest first: equally scored
// clips are ordered by id, so a ranking that ignores the features puts them on
// top.
const CORPUS = [
  "Make sense?",
  "Make sense?",
  "make sense.",
  "Make sense?",
  "make sense,",
  "Make sense.",
  "- Make sense?",
  ">> Make sense?",
  "Doesn't make sense.",
  "Does that make sense?",
  "That doesn't make sense!",
  "and it didn't really make sense to anybody in the room",
  "so I tried to make sense of what she had told me,",
  "None of us, of course, can make sense of what happened to us",
  "and the sense that we could make it through the winter",
  "you make a lot of sense when you talk like that",
  "When you look at the way the river bends here and the way the old town was built along it, it starts to make sense why they chose this spot.",
  "The more I read about the treaty, the less any of it seemed to make sense to me.",
  "I can't make any sense of this letter at all.",
  "You have to make some sense of it before Monday.",
  "A good sense of humor can make a long trip bearable.",
  "Can you make any sense out of what he said?",
  "It takes a lot of common sense to make a business work.",
  "Her sense of timing will make this scene work.",
  "I think you'll make the right choice if you use your common sense.",
  "Nobody could make much sense of the new rules.",
  "Make sure the sense of urgency comes across in the email.",
  "None of us, of course, can make sense of what happened to us.",
  "I'm still trying to make sense of the whole thing.",
  "It doesn't make sense to drive all the way back tonight.",
  "Historians have long struggled to make sense of the collapse.",
  "Does it make sense to buy a house right now?",
  "We need to make sense of the data before we decide.",
  "Children use stories to make sense of the world around them.",
  "That would make sense if he had been there that night.",
  "Let me try to make sense of these numbers for you.",
  "It would make sense to start with the smaller rooms first.",
  "Nothing about this case seems to make sense to me.",
  "If you think about it, it does make sense.",
  "Strange.",
  "Strange.",
  "strange,",
  "Strange!",
  "Strange, Defender Strange and Sinister Strange.",
  "that's so strange",
  "That's so strange.",
  "What a strange day.",
  "and then this strange man walked right up to us",
  "And then this strange man walked right up to us.",
  "his keen eye immediately identified the strange ships nearing the shore",
  "His keen eye immediately identified the strange ships nearing the shore.",
  "There's nothing strange about wanting a little time alone...",
  "it's strange how quiet the house gets once the kids leave,",
  "It was a strange thing to say to a little kid.",
  "There was something strange about the way he smiled at us.",
  "I know it sounds strange, but the old lighthouse keeper swore he heard someone singing out on the rocks every night",
  "I know it sounds strange, but the old lighthouse keeper swore he heard someone singing out on the rocks every single night.",
  "A strange silence fell over the crowd.",
  "That makes sense.",
  "It just makes no sense.",
  "Make it quick.",
  "Never gonna give you up.",
];

const VIDEOS = [
  { videoId: "dQw4w9WgXcQ", channelId: "UCuAXFkgsw1L7xaCfnd5JJOw" },
  { videoId: "8jPQjjsBbIc", channelId: "UCsT0YIqwnpJCM-mx7-gSA4Q" },
  { videoId: "hFZFjoX2cGg", channelId: "UCAuUUnT6oDeKwE6v1NGQxug" },
  { videoId: "arj7oStGLkU", channelId: "UCsooa4yRKGN_zEE8iknghZA" },
  { videoId: "iG9CE55wbtY", channelId: "UCAuUUnT6oDeKwE6v1NGQxug" },
];

const CAPTIONS: CaptionToIndex[] = CORPUS.map((text, i) => ({
  id: `caption-${String(i + 1).padStart(2, "0")}`,
  ...VIDEOS[i % VIDEOS.length],
  startTime: i * 3000,
  endTime: i * 3000 + 2800,
  text,
}));

describe("CaptionsService.search against Elasticsearch", () => {
  const searchIndex = useTestSearchIndex();
  const buildSut = () =>
    new CaptionsService(
      createLoggerMock() as unknown as Logger,
      searchIndex.client,
    );

  async function search(query: string, limit = 100): Promise<StoredCaption[]> {
    const result = await buildSut().search(query, { offset: 0, limit });
    assert.ok(result.ok);
    return result.value.captions;
  }

  it("keeps captions under 3 words out of the top 10 when enough good captions match", async () => {
    await searchIndex.writeCaptions(CAPTIONS);

    const top10 = await search("make sense", 10);

    assert.equal(top10.length, 10);
    assert.deepEqual(
      top10.filter((caption) => countWords(caption.text) < 3),
      [],
    );
  });

  it("ranks every caption of 6–14 words with the exact phrase before every caption with only the query's words", async () => {
    await searchIndex.writeCaptions(CAPTIONS);

    const ranked = await search("make sense");

    const hasPhrase = (caption: StoredCaption) =>
      /\bmake sense\b/i.test(caption.text);
    const comfortablePhraseRanks = ranks(ranked, (caption) => {
      const words = countWords(caption.text);
      return hasPhrase(caption) && words >= 6 && words <= 14;
    });
    const wordsOnlyRanks = ranks(ranked, (caption) => !hasPhrase(caption));
    assert.ok(comfortablePhraseRanks.length > 0 && wordsOnlyRanks.length > 0);
    assert.ok(
      Math.max(...comfortablePhraseRanks) < Math.min(...wordsOnlyRanks),
      "a caption of 6–14 words with the exact phrase ranks after a caption with only the words",
    );
  });

  it("ranks a whole sentence before a fragment of the same length", async () => {
    await searchIndex.writeCaptions(CAPTIONS);

    const ranked = await search("strange");

    const isWhole = (caption: StoredCaption) =>
      startsSentence(caption.text) && endsSentence(caption.text);
    const outranked = [];
    let pairs = 0;
    for (const [wholeRank, whole] of ranked.entries()) {
      if (!isWhole(whole)) continue;
      for (const [fragmentRank, fragment] of ranked.entries()) {
        if (isWhole(fragment)) continue;
        if (countWords(fragment.text) !== countWords(whole.text)) continue;
        pairs++;
        if (fragmentRank < wholeRank)
          outranked.push([fragment.text, whole.text]);
      }
    }
    assert.ok(pairs >= 3);
    assert.deepEqual(outranked, []);
  });

  it("returns every matching caption exactly once across the pages, with the same total on each", async () => {
    await searchIndex.writeCaptions(CAPTIONS);
    const matching = CAPTIONS.filter(
      ({ text }) => /\bmake\b/i.test(text) && /\bsense\b/i.test(text),
    );

    const pages = [];
    for (let offset = 0; offset < matching.length + 7; offset += 7) {
      const result = await buildSut().search("make sense", {
        offset,
        limit: 7,
      });
      assert.ok(result.ok);
      pages.push(result.value);
    }

    assert.deepEqual(
      pages
        .flatMap((page) => page.captions.map((caption) => caption.id))
        .sort(),
      matching.map((caption) => caption.id),
    );
    for (const page of pages) {
      assert.equal(page.total, matching.length);
      assert.equal(page.isTotalExact, true);
    }
  });
});

function ranks<T>(items: T[], predicate: (item: T) => boolean): number[] {
  return items.flatMap((item, rank) => (predicate(item) ? [rank] : []));
}

describe("CaptionsService.findByVideo against Elasticsearch", () => {
  const searchIndex = useTestSearchIndex();
  const buildSut = () =>
    new CaptionsService(
      createLoggerMock() as unknown as Logger,
      searchIndex.client,
    );

  it("returns the video's captions in the order they are spoken, and none of other videos'", async () => {
    await searchIndex.writeCaptions([
      {
        id: "caption-3",
        videoId: "dQw4w9WgXcQ",
        channelId: "UC-rick",
        startTime: 6100,
        endTime: 8000,
        text: "never gonna run around",
      },
      {
        id: "caption-1",
        videoId: "dQw4w9WgXcQ",
        channelId: "UC-rick",
        startTime: 2500,
        endTime: 4200,
        text: "never gonna give you up",
      },
      {
        id: "caption-other",
        videoId: "9bZkp7q19f0",
        channelId: "UC-psy",
        startTime: 3000,
        endTime: 5000,
        text: "oppan gangnam style",
      },
      {
        id: "caption-2",
        videoId: "dQw4w9WgXcQ",
        channelId: "UC-rick",
        startTime: 4200,
        endTime: 6100,
        text: "never gonna let you down",
      },
    ]);

    const result = await buildSut().findByVideo("dQw4w9WgXcQ");

    assert.deepEqual(result, {
      ok: true,
      value: [
        {
          captionId: "caption-1",
          startTime: 2500,
          endTime: 4200,
          text: "never gonna give you up",
        },
        {
          captionId: "caption-2",
          startTime: 4200,
          endTime: 6100,
          text: "never gonna let you down",
        },
        {
          captionId: "caption-3",
          startTime: 6100,
          endTime: 8000,
          text: "never gonna run around",
        },
      ],
    });
  });
});
