import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { captionsExtractor } from "./captions.extractor.js";

function extractAuto(events: unknown[]) {
  const result = captionsExtractor.extractFromJson({
    jsonResponse: { events },
    type: "auto",
  });
  assert.ok(result.ok);
  return result.value.map(({ textSegments, ...times }) => ({
    text: textSegments.map((segment) => segment.utf8).join(""),
    ...times,
  }));
}

describe("captionsExtractor.extractFromJson (auto)", () => {
  it("ends the last word of a line when the next line starts", () => {
    const captions = extractAuto([
      {
        tStartMs: 123439,
        dDurationMs: 3921,
        wWinId: 1,
        segs: [
          { utf8: "is" },
          { utf8: " legal", tOffsetMs: 1201 },
          { utf8: " weight", tOffsetMs: 1521 },
        ],
      },
      {
        tStartMs: 125590,
        dDurationMs: 1770,
        wWinId: 1,
        aAppend: 1,
        segs: [{ utf8: "\n" }],
      },
      {
        tStartMs: 125600,
        dDurationMs: 4079,
        wWinId: 1,
        segs: [{ utf8: "but" }, { utf8: " justices", tOffsetMs: 159 }],
      },
    ]);

    assert.deepEqual(captions.slice(0, 3), [
      { text: "is", startTime: 123439, endTime: 124640, duration: 1201 },
      { text: " legal", startTime: 124640, endTime: 124960, duration: 320 },
      { text: " weight", startTime: 124960, endTime: 125600, duration: 640 },
    ]);
  });

  it("ends the last word of a line followed by a pause when its line leaves the screen", () => {
    const captions = extractAuto([
      {
        tStartMs: 58200,
        dDurationMs: 2600,
        wWinId: 1,
        segs: [{ utf8: "about" }, { utf8: " this.", tOffsetMs: 200 }],
      },
      { tStartMs: 78630, wWinId: 1, aAppend: 1, segs: [{ utf8: "\n" }] },
      {
        tStartMs: 78640,
        dDurationMs: 2560,
        wWinId: 1,
        segs: [{ utf8: "This" }, { utf8: " good.", tOffsetMs: 240 }],
      },
    ]);

    assert.deepEqual(captions[1], {
      text: " this.",
      startTime: 58400,
      endTime: 60800,
      duration: 2400,
    });
  });

  it("ends the last word of the last line when the line leaves the screen", () => {
    const captions = extractAuto([
      {
        tStartMs: 125600,
        dDurationMs: 4079,
        wWinId: 1,
        segs: [{ utf8: "but" }, { utf8: " justices", tOffsetMs: 159 }],
      },
      {
        tStartMs: 127350,
        dDurationMs: 2329,
        wWinId: 1,
        aAppend: 1,
        segs: [{ utf8: "\n" }],
      },
    ]);

    assert.deepEqual(captions, [
      { text: "but", startTime: 125600, endTime: 125759, duration: 159 },
      { text: " justices", startTime: 125759, endTime: 129679, duration: 3920 },
    ]);
  });

  it("ends a word that shares its start with the next word where a later word starts", () => {
    const captions = extractAuto([
      {
        tStartMs: 419819,
        dDurationMs: 4921,
        wWinId: 1,
        segs: [
          { utf8: "IL" },
          { utf8: " when" },
          { utf8: " it", tOffsetMs: 301 },
        ],
      },
      {
        tStartMs: 422400,
        dDurationMs: 5519,
        wWinId: 1,
        segs: [{ utf8: "said" }],
      },
    ]);

    assert.deepEqual(captions.slice(0, 2), [
      { text: "IL", startTime: 419819, endTime: 420120, duration: 301 },
      { text: " when", startTime: 419819, endTime: 420120, duration: 301 },
    ]);
  });

  it("ends every segment of a block without offsets when the next block starts", () => {
    const captions = extractAuto([
      {
        tStartMs: 6660,
        dDurationMs: 6000,
        wWinId: 1,
        segs: [
          { utf8: "Trump's" },
          { utf8: " arraignment" },
          { utf8: " but I wanted to play\nfor you" },
        ],
      },
      {
        tStartMs: 10740,
        dDurationMs: 7500,
        wWinId: 1,
        segs: [{ utf8: "she said on 60 Minutes last night here\nshe is" }],
      },
    ]);

    assert.deepEqual(captions.slice(0, 3), [
      { text: "Trump's", startTime: 6660, endTime: 10740, duration: 4080 },
      { text: " arraignment", startTime: 6660, endTime: 10740, duration: 4080 },
      {
        text: " but I wanted to play\nfor you",
        startTime: 6660,
        endTime: 10740,
        duration: 4080,
      },
    ]);
  });

  it("ends the last word of a line at its line's end when overlapping lines repeat it", () => {
    const captions = extractAuto([
      {
        tStartMs: 2113680,
        dDurationMs: 2880,
        wWinId: 1,
        segs: [
          { utf8: "so" },
          { utf8: " uh", tOffsetMs: 2240 },
          { utf8: " funding", tOffsetMs: 2399 },
        ],
      },
      {
        tStartMs: 2114790,
        dDurationMs: 1770,
        wWinId: 1,
        aAppend: 1,
        segs: [{ utf8: "\n" }],
      },
      {
        tStartMs: 2114800,
        dDurationMs: 2400,
        wWinId: 1,
        segs: [
          { utf8: "fortunate" },
          { utf8: " funding", tOffsetMs: 1279 },
          { utf8: " a", tOffsetMs: 2160 },
        ],
      },
      {
        tStartMs: 2116550,
        dDurationMs: 650,
        wWinId: 1,
        aAppend: 1,
        segs: [{ utf8: "\n" }],
      },
      {
        tStartMs: 2116560,
        dDurationMs: 1760,
        wWinId: 1,
        segs: [{ utf8: "about" }],
      },
    ]);

    assert.deepEqual(captions.slice(0, 6), [
      { text: "so", startTime: 2113680, endTime: 2115920, duration: 2240 },
      { text: " uh", startTime: 2115920, endTime: 2116079, duration: 159 },
      {
        text: " funding",
        startTime: 2116079,
        endTime: 2116560,
        duration: 481,
      },
      {
        text: "fortunate",
        startTime: 2114800,
        endTime: 2116079,
        duration: 1279,
      },
      {
        text: " funding",
        startTime: 2116079,
        endTime: 2116960,
        duration: 881,
      },
      { text: " a", startTime: 2116960, endTime: 2117200, duration: 240 },
    ]);
  });

  it("ends the last word of a line at its line's end when the next line starts with it", () => {
    const captions = extractAuto([
      {
        tStartMs: 1676799,
        dDurationMs: 3360,
        wWinId: 1,
        segs: [
          { utf8: "I'm" },
          { utf8: " happens.", tOffsetMs: 1521 },
          { utf8: " All", tOffsetMs: 2321 },
        ],
      },
      {
        tStartMs: 1679110,
        dDurationMs: 1049,
        wWinId: 1,
        aAppend: 1,
        segs: [{ utf8: "\n" }],
      },
      {
        tStartMs: 1679120,
        dDurationMs: 4799,
        wWinId: 1,
        segs: [{ utf8: "right." }],
      },
    ]);

    assert.deepEqual(captions[2], {
      text: " All",
      startTime: 1679120,
      endTime: 1680159,
      duration: 1039,
    });
  });

  it("ends the last word of a line at its line's end when the next line started before it", () => {
    const captions = extractAuto([
      {
        tStartMs: 2118320,
        dDurationMs: 4799,
        wWinId: 1,
        segs: [{ utf8: "from" }, { utf8: " pilot", tOffsetMs: 2799 }],
      },
      {
        tStartMs: 2119109,
        dDurationMs: 4010,
        wWinId: 1,
        aAppend: 1,
        segs: [{ utf8: "\n" }],
      },
      {
        tStartMs: 2119119,
        dDurationMs: 4000,
        wWinId: 1,
        segs: [{ utf8: "notice" }, { utf8: " pilot", tOffsetMs: 2000 }],
      },
    ]);

    assert.deepEqual(captions[1], {
      text: " pilot",
      startTime: 2121119,
      endTime: 2123119,
      duration: 2000,
    });
  });

  it("ends a last word placed after its line's end when the next line starts", () => {
    const captions = extractAuto([
      {
        tStartMs: 2137760,
        wWinId: 1,
        segs: [
          { utf8: "three" },
          { utf8: " country", tOffsetMs: 1839 },
          { utf8: " uh", tOffsetMs: 2640 },
        ],
      },
      {
        tStartMs: 2140480,
        wWinId: 1,
        segs: [
          { utf8: "for" },
          { utf8: " purpose.", tOffsetMs: 480 },
          { utf8: " And so we were", tOffsetMs: 1840 },
        ],
      },
    ]);

    assert.deepEqual(captions[2], {
      text: " uh",
      startTime: 2140400,
      endTime: 2140480,
      duration: 80,
    });
  });

  it("gives a last word placed after its line's end zero length when no later line starts after it", () => {
    const captions = extractAuto([
      {
        tStartMs: 2140480,
        wWinId: 1,
        segs: [
          { utf8: "for" },
          { utf8: " purpose.", tOffsetMs: 480 },
          { utf8: " And so we were", tOffsetMs: 1840 },
        ],
      },
      {
        tStartMs: 2140480,
        dDurationMs: 8119,
        wWinId: 1,
        segs: [{ utf8: "for" }, { utf8: " purpose.", tOffsetMs: 480 }],
      },
    ]);

    assert.deepEqual(captions[2], {
      text: " And so we were",
      startTime: 2142320,
      endTime: 2142320,
      duration: 0,
    });
  });
});
