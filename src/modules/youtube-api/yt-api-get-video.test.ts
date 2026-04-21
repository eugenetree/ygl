/**
 * Integration tests for YoutubeApiGetVideo.getVideo()
 *
 * These tests make real network requests (yt-dlp + YouTube caption fetch).
 * Run with:  npx tsx --test src/modules/youtube-api/yt-api-get-video.test.ts
 */

import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { YoutubeApiGetVideo } from "./yt-api-get-video.js";
import { YtDlpClient } from "./yt-dlp-client.js";
import { Logger } from "../_common/logger/logger.js";

const TIMEOUT = 60_000;

function createService(): YoutubeApiGetVideo {
  const logger = new Logger({ context: "test", category: "test" });
  const ytDlpClient = new YtDlpClient(logger);
  return new YoutubeApiGetVideo(logger, ytDlpClient);
}

describe("YoutubeApiGetVideo.getVideo()", () => {
  const service = createService();

  it("returns Success(BOTH) with correct video metadata and captions for Wnp_cMw_GxM", { timeout: TIMEOUT }, async () => {
    const result = await service.getVideo("Wnp_cMw_GxM");

    assert.ok(result.ok, `Expected success but got failure: ${JSON.stringify(!result.ok && result.error)}`);

    const video = result.value;

    // -- Video metadata --
    assert.equal(video.captionStatus, "BOTH");
    assert.equal(video.id, "Wnp_cMw_GxM");
    assert.equal(video.title, "This Week at Lincoln Center\u2014June 15, 2017\u2014WNET");
    assert.equal(video.duration, 51);
    assert.equal(video.channelId, "UC5stUbrIlkm5UTMPgVm2dsg");
    assert.equal(video.languageCode, "en");
    assert.equal(typeof video.thumbnail, "string");
    assert.ok(video.keywords.includes("Lincoln Center"), `Expected keywords to include "Lincoln Center", got: ${video.keywords}`);

    // -- Auto captions --
    assert.ok(video.autoCaptions.length > 0, "Expected non-empty autoCaptions");
    for (const caption of video.autoCaptions) {
      assert.equal(typeof caption.startTime, "number");
      assert.equal(typeof caption.endTime, "number");
      assert.equal(typeof caption.duration, "number");
      assert.equal(typeof caption.text, "string");
      assert.ok(caption.text.length > 0, "Expected non-empty caption text");
    }
    assert.ok(
      video.autoCaptions[0].text.toLowerCase().includes("hello"),
      `Expected first auto caption to contain "hello", got: "${video.autoCaptions[0].text}"`,
    );

    // -- Manual captions --
    assert.ok(video.manualCaptions.length > 0, "Expected non-empty manualCaptions");
    for (const caption of video.manualCaptions) {
      assert.equal(typeof caption.startTime, "number");
      assert.equal(typeof caption.endTime, "number");
      assert.equal(typeof caption.duration, "number");
      assert.equal(typeof caption.text, "string");
      assert.ok(caption.text.length > 0, "Expected non-empty caption text");
    }
    assert.ok(
      video.manualCaptions[0].text.includes("Hello"),
      `Expected first manual caption to contain "Hello", got: "${video.manualCaptions[0].text}"`,
    );
  });

  it("returns Success(AUTO_ONLY) for video with only auto captions (3IT2Cc_5WxE)", { timeout: TIMEOUT }, async () => {
    const result = await service.getVideo("3IT2Cc_5WxE");

    assert.ok(result.ok, `Expected success but got failure: ${JSON.stringify(!result.ok && result.error)}`);
    assert.equal(result.value.captionStatus, "AUTO_ONLY");
    assert.equal(result.value.languageCode, "en");
    assert.equal(result.value.autoCaptions, null);
    assert.equal(result.value.manualCaptions, null);
  });

  it("returns Success(MANUAL_ONLY) for video with only manual captions (SFnMTHhKdkw)", { timeout: TIMEOUT }, async () => {
    const result = await service.getVideo("SFnMTHhKdkw");

    assert.ok(result.ok, `Expected success but got failure: ${JSON.stringify(!result.ok && result.error)}`);
    assert.equal(result.value.captionStatus, "MANUAL_ONLY");
    assert.equal(result.value.languageCode, null);
    assert.equal(result.value.autoCaptions, null);
    assert.equal(result.value.manualCaptions, null);
  });

  it("detects Thai (th) via th-orig key despite yt-dlp reporting en-US (wda-B3NJSek)", { timeout: TIMEOUT }, async () => {
    const result = await service.getVideo("wda-B3NJSek");

    assert.ok(result.ok, `Expected success but got failure: ${JSON.stringify(!result.ok && result.error)}`);
    assert.equal(result.value.captionStatus, "AUTO_ONLY");
    assert.equal(result.value.languageCode, "th");
    assert.equal(result.value.autoCaptions, null);
    assert.equal(result.value.manualCaptions, null);
  });

  it("returns Success(NONE) for video with no captions (7DNz25c6BRg)", { timeout: TIMEOUT }, async () => {
    const result = await service.getVideo("7DNz25c6BRg");

    assert.ok(result.ok, `Expected success but got failure: ${JSON.stringify(!result.ok && result.error)}`);
    assert.equal(result.value.captionStatus, "NONE");
    assert.equal(result.value.languageCode, null);
    assert.equal(result.value.autoCaptions, null);
    assert.equal(result.value.manualCaptions, null);
  });
});
