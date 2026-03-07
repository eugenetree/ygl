/**
 * Integration tests for YoutubeApiGetVideo.getVideo()
 *
 * These tests make real network requests (yt-dlp + YouTube caption fetch).
 * Run with:  npx tsx --test src/modules/youtube-api/yt-api-get-video.test.ts
 */

import "reflect-metadata";
import { setTimeout } from "node:timers/promises";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { YoutubeApiGetVideo } from "./yt-api-get-video.js";
import { YtDlpClient } from "./yt-dlp-client.js";
import { Logger } from "../_common/logger/logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createService(): YoutubeApiGetVideo {
  const logger = new Logger({ context: "test", category: "test" });
  const ytDlpClient = new YtDlpClient(logger);
  return new YoutubeApiGetVideo(logger, ytDlpClient);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("YoutubeApiGetVideo.getVideo() – captionStatus", { concurrency: false }, () => {
  const service = createService();

  afterEach(async () => {
    console.log("Waiting 5 seconds before next test...");
    await setTimeout(5000);
  });

  it("returns BOTH for s5P3EYUN1Zo (has manual + auto captions)", async () => {
    const result = await service.getVideo("s5P3EYUN1Zo");
    assert.ok(result.ok, `Expected success but got failure: ${JSON.stringify(!result.ok && result.error)}`);
    assert.equal(result.value.captionStatus, "BOTH");
  });

  it("returns MANUAL_ONLY for 1ALfKWG2nmw (manual captions, no auto)", async () => {
    const result = await service.getVideo("1ALfKWG2nmw");
    assert.ok(result.ok, `Expected success but got failure: ${JSON.stringify(!result.ok && result.error)}`);
    assert.equal(result.value.captionStatus, "MANUAL_ONLY");
  });

  it("returns AUTO_ONLY for gIdcvIqkSBA (auto captions, no manual)", async () => {
    const result = await service.getVideo("gIdcvIqkSBA");
    assert.ok(result.ok, `Expected success but got failure: ${JSON.stringify(!result.ok && result.error)}`);
    assert.equal(result.value.captionStatus, "AUTO_ONLY");
  });

  it("returns NONE for csCUpDwEAWk (no captions at all)", async () => {
    const result = await service.getVideo("csCUpDwEAWk");
    assert.ok(result.ok, `Expected success but got failure: ${JSON.stringify(!result.ok && result.error)}`);
    assert.equal(result.value.captionStatus, "NONE");
  });
});
