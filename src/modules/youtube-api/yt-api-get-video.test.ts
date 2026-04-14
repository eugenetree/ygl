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

function createService(): YoutubeApiGetVideo {
  const logger = new Logger({ context: "test", category: "test" });
  const ytDlpClient = new YtDlpClient(logger);
  return new YoutubeApiGetVideo(logger, ytDlpClient);
}

describe("YoutubeApiGetVideo.getVideo()", () => {
  const service = createService();

  it("returns Success(BOTH) with correct video metadata and captions for Wnp_cMw_GxM", { timeout: 30_000 }, async () => {
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
});
